import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import restaurantRoutes from './routes/restaurantRoutes.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';
import { connectKafka, runConsumer } from './kafka.js';

dotenv.config();

const app = express();

await mongoose.connect(process.env.MONGO_URI);
await connectKafka();
runConsumer().catch((error) => {
  console.error('[Restaurant Service] Consumer loop crashed:', error);
});

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
  res.json({ success: true, service: 'restaurant-service' });
});

app.use('/api/restaurants', restaurantRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(process.env.PORT || 4002, () => {
  console.log('Restaurant service running on port 4002');
});
