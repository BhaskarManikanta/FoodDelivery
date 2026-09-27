import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import { connectConsumer, runConsumer } from './kafka.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'notification-service'
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  await connectConsumer();
  await runConsumer();

  app.listen(process.env.PORT || 4005, () => {
    console.log('Notification service running on port 4005');
  });
};

start().catch((error) => {
  console.error('Failed to start notification service:', error);
  process.exit(1);
});