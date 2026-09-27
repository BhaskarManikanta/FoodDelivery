import { Kafka } from 'kafkajs';
import Redis from 'ioredis';
import Order from './models/Order.js';
import { buildEvent } from '../../../shared/kafka/eventEnvelope.js';
import { wasAlreadyProcessed, markProcessed } from '../../../shared/redis/idempotency.js';
import { withRetryAndDeadLetter } from '../../../shared/kafka/deadLetter.js';
import { applyTransition, TRANSITION_RESULT } from './transitionOrder.js';

const CONSUMER_GROUP = 'order-service-group';

const redis = new Redis(process.env.REDIS_URL);

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
});

export const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });

export const connectProducer = async () => {
  await producer.connect();
};

export const connectConsumer = async () => {
  await consumer.connect();
  const topics = ['restaurant-accepted', 'restaurant-rejected', 'agent-assigned', 'no-agent-available'];
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
};

// Live UI push, NOT the source of truth — the REST GET /api/orders/:id
// response always reflects the real state. This is the trusted
// replacement for the old client-emitted 'order-status' socket event
// (BUG-005): only Order Service, right after a transition it validated
// and persisted, ever publishes here.
const broadcastOrderStatus = async (order) => {
  await redis.publish(
    'order-status-updates',
    JSON.stringify({
      orderId: order._id.toString(),
      status: order.status,
      updatedAt: order.updatedAt
    })
  );
};

const handleRestaurantAccepted = async (data) => {
  const { orderId } = data;
  const first = await applyTransition(orderId, 'RESTAURANT_ACCEPTED');
  if (first.result === TRANSITION_RESULT.APPLIED || first.result === TRANSITION_RESULT.ALREADY_APPLIED) {
    await broadcastOrderStatus(first.order);
  }
  // Acceptance immediately implies "now waiting on an agent" — chained in
  // the same handler rather than waiting for a separate event, since
  // nothing else produces one for this specific micro-transition.
  const second = await applyTransition(orderId, 'AGENT_ASSIGNMENT_PENDING');
  if (second.result === TRANSITION_RESULT.APPLIED || second.result === TRANSITION_RESULT.ALREADY_APPLIED) {
    await broadcastOrderStatus(second.order);
  }
};

const handleRestaurantRejected = async (data) => {
  const { orderId, reason } = data;
  // BUG-012: rejection needs a complete, not dangling, outcome. This
  // project implements that as "auto-cancel + notify the customer" rather
  // than restaurant reassignment — see README for why, and what a fuller
  // reassignment workflow would add.
  const result = await applyTransition(orderId, 'CANCELLED', {
    extraFields: { lastFailureReason: `RESTAURANT_REJECTED:${reason}` },
    event: {
      topic: 'order-cancelled',
      eventType: 'ORDER_CANCELLED',
      data: { orderId, reason: 'RESTAURANT_REJECTED' }
    }
  });
  if (result.result === TRANSITION_RESULT.APPLIED || result.result === TRANSITION_RESULT.ALREADY_APPLIED) {
    if (result.order) await broadcastOrderStatus(result.order);
  }
};

const handleAgentAssigned = async (data) => {
  const { orderId, agentId } = data;
  const result = await applyTransition(orderId, 'AGENT_ASSIGNED', {
    extraFields: { assignedAgentId: agentId }
  });
  if (result.result === TRANSITION_RESULT.APPLIED || result.result === TRANSITION_RESULT.ALREADY_APPLIED) {
    await broadcastOrderStatus(result.order);
  }
};

const handleNoAgentAvailable = async (data) => {
  const { orderId, reason } = data;
  const result = await applyTransition(orderId, 'CANCELLED', {
    extraFields: { lastFailureReason: `NO_AGENT_AVAILABLE:${reason}` },
    event: {
      topic: 'order-cancelled',
      eventType: 'ORDER_CANCELLED',
      data: { orderId, reason: 'NO_AGENT_AVAILABLE' }
    }
  });
  if (result.result === TRANSITION_RESULT.APPLIED || result.result === TRANSITION_RESULT.ALREADY_APPLIED) {
    if (result.order) await broadcastOrderStatus(result.order);
  }
};

const HANDLERS = {
  RESTAURANT_ACCEPTED: handleRestaurantAccepted,
  RESTAURANT_REJECTED: handleRestaurantRejected,
  AGENT_ASSIGNED: handleAgentAssigned,
  NO_AGENT_AVAILABLE: handleNoAgentAvailable
};

export const runConsumer = async () => {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      await withRetryAndDeadLetter(
        async () => {
          const event = JSON.parse(message.value.toString());

          if (await wasAlreadyProcessed(redis, CONSUMER_GROUP, event.eventId)) {
            console.log(`[Order Service] Skipping already-processed event ${event.eventId} (${event.eventType})`);
            return;
          }

          const handler = HANDLERS[event.eventType];
          if (handler) {
            await handler(event.data);
          }

          // Marked done only AFTER the handler above completed
          // successfully — see shared/redis/idempotency.js for why this
          // ordering is the actual fix for BUG-011.
          await markProcessed(redis, CONSUMER_GROUP, event.eventId);
        },
        { producer, topic, message, consumerGroup: CONSUMER_GROUP }
      );
    }
  });
};

// The outbox relay (BUG-010): drains PENDING events queued by
// applyTransition()/createOrder() and publishes them to Kafka. Runs
// independently of the request path, so a Kafka outage at order-creation
// time delays notification/downstream processing but never loses the
// event or leaves the order without one.
export const startOutboxRelay = (intervalMs = 2000) => {
  const MAX_ATTEMPTS = 5;

  setInterval(async () => {
    try {
      const orders = await Order.find({ 'outbox.status': 'PENDING' }).limit(20);

      for (const order of orders) {
        for (const evt of order.outbox) {
          if (evt.status !== 'PENDING') continue;

          try {
            const envelope = buildEvent(evt.eventType, 'order-service', evt.data);
            await producer.send({
              topic: evt.topic,
              messages: [{ key: String(order._id), value: JSON.stringify(envelope) }]
            });

            await Order.updateOne(
              { _id: order._id, 'outbox.eventId': evt.eventId },
              { $set: { 'outbox.$.status': 'PUBLISHED', 'outbox.$.publishedAt': new Date() } }
            );
          } catch (err) {
            const attempts = (evt.attempts || 0) + 1;
            const nextStatus = attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';

            await Order.updateOne(
              { _id: order._id, 'outbox.eventId': evt.eventId },
              { $set: { 'outbox.$.attempts': attempts, 'outbox.$.status': nextStatus } }
            );

            if (nextStatus === 'FAILED') {
              console.error(
                `[Outbox] Giving up on ${evt.eventType} for order ${order._id} after ${attempts} attempts — needs manual inspection:`,
                err.message
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('[Outbox] Relay loop error:', err.message);
    }
  }, intervalMs);
};
