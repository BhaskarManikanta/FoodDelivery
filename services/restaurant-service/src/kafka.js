import { Kafka } from 'kafkajs';
import Redis from 'ioredis';
import { buildEvent } from '../../../shared/kafka/eventEnvelope.js';
import { wasAlreadyProcessed, markProcessed } from '../../../shared/redis/idempotency.js';
import { withRetryAndDeadLetter } from '../../../shared/kafka/deadLetter.js';
import Restaurant from './models/Restaurant.js';

const CONSUMER_GROUP = 'restaurant-service-group';

const redis = new Redis(process.env.REDIS_URL);

const kafka = new Kafka({
  clientId: 'restaurant-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });

const publishEvent = async (topic, eventType, data) => {
  const event = buildEvent(eventType, 'restaurant-service', data);
  await producer.send({
    topic,
    messages: [{ key: String(data.orderId), value: JSON.stringify(event) }]
  });
};

export const connectKafka = async () => {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'order-created', fromBeginning: false });
};

const handleOrderCreated = async (data) => {
  const { orderId, restaurantId } = data;
  const restaurant = await Restaurant.findById(restaurantId).catch(() => null);

  if (!restaurant) {
    await publishEvent('restaurant-rejected', 'RESTAURANT_REJECTED', {
      orderId,
      restaurantId,
      reason: 'RESTAURANT_NOT_FOUND'
    });
    console.log(`[Restaurant Service] Rejected order ${orderId} — restaurant not found`);
    return;
  }

  if (!restaurant.isOpen) {
    await publishEvent('restaurant-rejected', 'RESTAURANT_REJECTED', {
      orderId,
      restaurantId,
      reason: 'RESTAURANT_CLOSED'
    });
    console.log(`[Restaurant Service] Rejected order ${orderId} — restaurant closed`);
    return;
  }

  // Notify the restaurant owner in real-time via Redis pub/sub
  // The restaurant staff reviews incoming orders on their dashboard and manually accepts or rejects
  await redis.publish(
    'restaurant-orders',
    JSON.stringify({
      restaurantOwnerId: restaurant.ownerId,
      restaurantId: restaurant._id.toString(),
      orderId,
      items: data.items,
      totalAmount: data.totalAmount,
      deliveryAddress: data.deliveryAddress,
      specialInstructions: data.specialInstructions,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      createdAt: data.createdAt || new Date().toISOString()
    })
  );

  console.log(`[Restaurant Service] Order ${orderId} routed to restaurant ${restaurant._id} for manual acceptance`);
};

export const runConsumer = async () => {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      await withRetryAndDeadLetter(
        async () => {
          const event = JSON.parse(message.value.toString());

          if (event.eventType !== 'ORDER_CREATED') return;

          if (await wasAlreadyProcessed(redis, CONSUMER_GROUP, event.eventId)) {
            console.log(`[Restaurant Service] Skipping already-processed event ${event.eventId}`);
            return;
          }

          await handleOrderCreated(event.data);

          await markProcessed(redis, CONSUMER_GROUP, event.eventId);
        },
        { producer, topic, message, consumerGroup: CONSUMER_GROUP }
      );
    }
  });
};
