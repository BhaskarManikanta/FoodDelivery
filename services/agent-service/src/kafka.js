import { Kafka } from 'kafkajs';
import Redis from 'ioredis';
import { buildEvent } from '../../../shared/kafka/eventEnvelope.js';
import { wasAlreadyProcessed, markProcessed } from '../../../shared/redis/idempotency.js';
import { withRetryAndDeadLetter } from '../../../shared/kafka/deadLetter.js';
import { reserveNearestAgent, releaseAgent } from './controllers/agentController.js';

const CONSUMER_GROUP = 'agent-service-group';

const redis = new Redis(process.env.REDIS_URL);

const kafka = new Kafka({
  clientId: 'agent-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });

const publishEvent = async (topic, eventType, data) => {
  const event = buildEvent(eventType, 'agent-service', data);
  await producer.send({
    topic,
    messages: [{ key: String(data.orderId), value: JSON.stringify(event) }]
  });
};

export const connectKafka = async () => {
  await producer.connect();
  await consumer.connect();
  // 'restaurant-accepted' drives auto-assignment. The three terminal-order
  // topics are subscribed to so this service — which is the one that
  // actually owns agent availability state — can release the agent itself
  // (BUG-013) rather than relying on another service to know about its
  // internal Redis keys.
  const topics = ['restaurant-accepted', 'order-delivered', 'delivery-failed', 'order-cancelled'];
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
};

const handleRestaurantAccepted = async (data) => {
  const { orderId, restaurantLocation } = data;
  const lat = restaurantLocation?.lat ?? null;
  const lng = restaurantLocation?.lng ?? null;

  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    // BUG-024: (0, 0) is a real place (the Gulf of Guinea) — treating a
    // missing/default location as if it were valid would run the nearest-
    // agent search there instead of failing loudly.
    await publishEvent('no-agent-available', 'NO_AGENT_AVAILABLE', {
      orderId,
      reason: 'RESTAURANT_LOCATION_INVALID'
    });
    console.warn(`[Agent Service] Restaurant location missing/invalid for order ${orderId} — cannot dispatch`);
    return;
  }

  const assigned = await reserveNearestAgent(orderId, lng, lat);

  if (!assigned) {
    await publishEvent('no-agent-available', 'NO_AGENT_AVAILABLE', {
      orderId,
      reason: 'NO_AGENTS_ONLINE_NEARBY'
    });
    console.log(`[Agent Service] No agent available for order ${orderId}`);
    return;
  }

  await publishEvent('agent-assigned', 'AGENT_ASSIGNED', {
    orderId,
    agentId: assigned.agentId,
    distanceKm: assigned.distance
  });

  console.log(`[Agent Service] Assigned agent ${assigned.agentId} to order ${orderId} (${assigned.distance} km away)`);
};

const handleTerminalOrder = async (data) => {
  const { agentId } = data;
  if (!agentId) return; // e.g. a cancellation before any agent was ever assigned
  await releaseAgent(agentId);
  console.log(`[Agent Service] Released agent ${agentId} — order reached a terminal state`);
};

const HANDLERS_BY_TOPIC = {
  'restaurant-accepted': (data) => handleRestaurantAccepted(data),
  'order-delivered': (data) => handleTerminalOrder(data),
  'delivery-failed': (data) => handleTerminalOrder(data),
  'order-cancelled': (data) => handleTerminalOrder(data)
};

export const runConsumer = async () => {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      await withRetryAndDeadLetter(
        async () => {
          const event = JSON.parse(message.value.toString());

          if (await wasAlreadyProcessed(redis, CONSUMER_GROUP, event.eventId)) {
            console.log(`[Agent Service] Skipping already-processed event ${event.eventId}`);
            return;
          }

          const handler = HANDLERS_BY_TOPIC[topic];
          if (handler) {
            await handler(event.data);
          }

          await markProcessed(redis, CONSUMER_GROUP, event.eventId);
        },
        { producer, topic, message, consumerGroup: CONSUMER_GROUP }
      );
    }
  });
};
