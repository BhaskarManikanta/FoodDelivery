import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'food-delivery-app',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(',')
});

export default kafka;