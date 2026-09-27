import { Kafka } from 'kafkajs';
import Redis from 'ioredis';
import { wasAlreadyProcessed, markProcessed } from '../../../shared/redis/idempotency.js';
import { withRetryAndDeadLetter } from '../../../shared/kafka/deadLetter.js';

const CONSUMER_GROUP = process.env.KAFKA_GROUP_ID || 'notification-service-group';

const redis = new Redis(process.env.REDIS_URL);

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
});

// A producer is needed here too now — not to publish domain events (this
// service never does that), but because withRetryAndDeadLetter needs
// somewhere to send a message that fails processing after every retry.
const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });

// Every topic in the platform's event lifecycle — Notification Service is
// the one place that's supposed to hear about all of them.
const TOPICS = [
  'order-created',
  'restaurant-accepted',
  'restaurant-rejected',
  'agent-assigned',
  'no-agent-available',
  'order-picked-up',
  'out-for-delivery',
  'order-delivered',
  'delivery-failed',
  'order-cancelled'
];

export const connectConsumer = async () => {
  await producer.connect();
  await consumer.connect();
  for (const topic of TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
};

const NOTIFICATION_COPY = {
  ORDER_CREATED: (d) => `[EMAIL SIMULATION] Order ${d.orderId} has been created successfully.`,
  RESTAURANT_ACCEPTED: (d) => `[PUSH SIMULATION] Restaurant accepted order ${d.orderId}.`,
  RESTAURANT_REJECTED: (d) => `[PUSH SIMULATION] Restaurant could not take order ${d.orderId} (${d.reason}).`,
  AGENT_ASSIGNED: (d) => `[PUSH SIMULATION] Delivery agent ${d.agentId} assigned to order ${d.orderId}.`,
  NO_AGENT_AVAILABLE: (d) => `[PUSH SIMULATION] No delivery agent available yet for order ${d.orderId}.`,
  ORDER_PICKED_UP: (d) => `[PUSH SIMULATION] Order ${d.orderId} has been picked up by the agent.`,
  OUT_FOR_DELIVERY: (d) => `[SMS SIMULATION] Order ${d.orderId} is now out for delivery.`,
  ORDER_DELIVERED: (d) => `[EMAIL SIMULATION] Order ${d.orderId} has been delivered.`,
  DELIVERY_FAILED: (d) => `[PUSH SIMULATION] Delivery failed for order ${d.orderId}.`,
  ORDER_CANCELLED: (d) => `[EMAIL SIMULATION] Order ${d.orderId} was cancelled.`
};

export const runConsumer = async () => {
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      await withRetryAndDeadLetter(
        async () => {
          const event = JSON.parse(message.value?.toString() || '{}');

          if (event.eventId && (await wasAlreadyProcessed(redis, CONSUMER_GROUP, event.eventId))) {
            console.log(`[Notification Service] Skipping already-processed event ${event.eventId}`);
            return;
          }

          console.log('------------------------------');
          console.log(`[Notification Service] Topic: ${topic}`);
          console.log(`[Notification Service] Partition: ${partition}`);
          console.log(`[Notification Service] Event: ${event.eventType}`);
          console.log(`[Notification Service] Order ID: ${event.data?.orderId || 'N/A'}`);

          const buildCopy = NOTIFICATION_COPY[event.eventType];
          console.log(buildCopy ? buildCopy(event.data) : `[INFO] Unhandled event type ${event.eventType}`);
          console.log('------------------------------');

          // Marked done only AFTER the "notification" above was actually
          // sent — see shared/redis/idempotency.js for why this ordering
          // matters once a crash happens mid-handler.
          if (event.eventId) {
            await markProcessed(redis, CONSUMER_GROUP, event.eventId);
          }
        },
        { producer, topic, message, consumerGroup: CONSUMER_GROUP }
      );
    }
  });
};
