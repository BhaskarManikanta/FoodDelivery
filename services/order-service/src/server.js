import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import orderRoutes from './routes/orderRoutes.js';
import { connectConsumer, connectProducer, runConsumer, startOutboxRelay } from './kafka.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';

dotenv.config();

const app = express();

await mongoose.connect(process.env.MONGO_URI);
await connectProducer();
await connectConsumer();
runConsumer().catch((error) => {
  console.error('[Order Service] Consumer loop crashed:', error);
});
startOutboxRelay();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ success: true, service: 'order-service' });
});

app.use('/api/orders', orderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(process.env.PORT || 4003, () => {
  console.log('Order service running on port 4003');
});
