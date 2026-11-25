import { Kafka } from 'kafkajs';
import Redis from 'ioredis';
import { wasAlreadyProcessed, markProcessed } from '../../../shared/redis/idempotency.js';
import { withRetryAndDeadLetter } from '../../../shared/kafka/deadLetter.js';
import Notification from './models/Notification.js';

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
  'order-preparing',
  'order-ready-for-pickup',
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

const NOTIFICATION_DETAILS = {
  ORDER_CREATED: (d) => ({
    title: 'Order Placed',
    message: `Order #${String(d.orderId || '').slice(-6)} placed successfully. Waiting for restaurant confirmation.`
  }),
  RESTAURANT_ACCEPTED: (d) => ({
    title: 'Restaurant Accepted',
    message: `Restaurant has accepted order #${String(d.orderId || '').slice(-6)}. Estimated preparation time: ${d.estimatedPrepTime || 30} mins.`
  }),
  ORDER_PREPARING: (d) => ({
    title: 'Kitchen Preparing',
    message: `Your food for order #${String(d.orderId || '').slice(-6)} is being freshly prepared in the kitchen.`
  }),
  ORDER_READY_FOR_PICKUP: (d) => ({
    title: 'Ready for Pickup',
    message: `Order #${String(d.orderId || '').slice(-6)} is packed and ready for delivery partner pickup.`
  }),
  RESTAURANT_REJECTED: (d) => ({
    title: 'Order Declined',
    message: `Restaurant could not accept order #${String(d.orderId || '').slice(-6)} (${d.reason || 'Not available'}).`
  }),
  AGENT_ASSIGNED: (d) => ({
    title: 'Delivery Partner Assigned',
    message: `Delivery agent ${d.agentId ? '#' + String(d.agentId).slice(-4) : ''} has been assigned to order #${String(d.orderId || '').slice(-6)}.`
  }),
  NO_AGENT_AVAILABLE: (d) => ({
    title: 'Searching for Delivery Partner',
    message: `Looking for nearby available delivery partners for order #${String(d.orderId || '').slice(-6)}.`
  }),
  ORDER_PICKED_UP: (d) => ({
    title: 'Order Picked Up',
    message: `Delivery agent has picked up order #${String(d.orderId || '').slice(-6)} from the restaurant.`
  }),
  OUT_FOR_DELIVERY: (d) => ({
    title: 'Out for Delivery',
    message: `Order #${String(d.orderId || '').slice(-6)} is on the way! Live tracking is active.`
  }),
  ORDER_DELIVERED: (d) => ({
    title: 'Order Delivered',
    message: `Order #${String(d.orderId || '').slice(-6)} has been delivered. Enjoy your meal!`
  }),
  DELIVERY_FAILED: (d) => ({
    title: 'Delivery Failed',
    message: `Delivery attempt for order #${String(d.orderId || '').slice(-6)} could not be completed.`
  }),
  ORDER_CANCELLED: (d) => ({
    title: 'Order Cancelled',
    message: `Order #${String(d.orderId || '').slice(-6)} was cancelled.`
  })
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

          const getDetails = NOTIFICATION_DETAILS[event.eventType];
          const details = getDetails ? getDetails(event.data || {}) : null;

          if (details && event.data?.userId) {
            try {
              const notification = await Notification.create({
                userId: event.data.userId,
                orderId: event.data.orderId || 'unknown',
                type: event.eventType,
                title: details.title,
                message: details.message
              });

              // Broadcast real-time notification to user via Redis pub/sub
              await redis.publish(
                'notifications-updates',
                JSON.stringify({
                  userId: event.data.userId,
                  notification
                })
              );
            } catch (err) {
              console.error('[Notification Service] Error persisting notification:', err.message);
            }
          }

          console.log(`[Notification Service] Event: ${event.eventType} | Order: ${event.data?.orderId || 'N/A'}`);

          if (event.eventId) {
            await markProcessed(redis, CONSUMER_GROUP, event.eventId);
          }
        },
        { producer, topic, message, consumerGroup: CONSUMER_GROUP }
      );
    }
  });
};
