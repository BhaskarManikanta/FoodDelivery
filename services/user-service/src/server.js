import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import userRoutes from './routes/userRoutes.js';
import { errorHandler, notFoundHandler } from '../../../shared/errors/errorHandler.js';

dotenv.config();

const app = express();


console.log('MONGO_URI =>', process.env.MONGO_URI);

await mongoose.connect(process.env.MONGO_URI);

app.use(helmet());
app.use(
  cors({
    origin: "*" || process.env.FRONTEND_URL,
    credentials: true
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'user-service'
  });
});

app.use('/api/users', userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(process.env.PORT || 4001, () => {
  console.log('User service running on port 4001');
});