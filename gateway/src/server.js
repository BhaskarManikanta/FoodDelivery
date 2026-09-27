import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import http from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { errorHandler, notFoundHandler } from '../../shared/errors/errorHandler.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Services mount their routers under /api/<resource>. Because Express strips
// the mount prefix before handing the request to a mounted middleware, the
// proxy target must include that prefix. Otherwise POST /api/users/login is
// forwarded as /login and the service correctly returns 404.
const serviceTarget = (baseUrl, apiPrefix) => `${baseUrl.replace(/\/$/, '')}${apiPrefix}`;

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  }
});

const redis = new Redis(process.env.REDIS_URL);

// A Redis client in subscribe mode can't run other commands, so it needs
// its own connection, separate from the one used for rate limiting.
const trackingSubscriber = new Redis(process.env.REDIS_URL);

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
);
// IMPORTANT: no express.json() here. This is a proxy, not an API that reads
// req.body itself — and express.json() reading the request stream here
// would leave nothing for http-proxy-middleware to forward: it pipes the
// raw request stream through to the target service, and a stream that
// express.json() already consumed is empty. That silently turns every
// proxied POST/PATCH/PUT (register, login, create order, ...) into a
// request that hangs forever waiting for a body the target service never
// receives. Verified live: this line caused curl to hang until timeout
// with HTTP status 000 on every write request through the gateway.
app.use(morgan('dev'));

// Routes that must work with NO Authorization header, or with a STALE one
// — a client that still has an old/expired token sitting in localStorage
// from a previous session should still be able to log back in.
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/users/register' },
  { method: 'POST', path: '/api/users/login' }
];

const isPublicRoute = (req) =>
  PUBLIC_ROUTES.some((route) => route.method === req.method && req.path === route.path);

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) return next();

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// BUG-041: a single blanket rate limit doesn't differentiate login/register
// (worth protecting tightly against brute-forcing/credential stuffing)
// from ordinary browsing traffic (worth being generous with). Each takes
// its own Redis counter bucket and its own limit.
const makeRateLimiter = ({ windowSeconds, max, bucket }) => async (req, res, next) => {
  const key = `rate:${bucket}:${req.ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (count > max) {
    return res.status(429).json({ success: false, message: 'Too many requests' });
  }

  next();
};

const authRateLimit = makeRateLimiter({ windowSeconds: 60, max: 10, bucket: 'auth' });
const generalRateLimit = makeRateLimiter({ windowSeconds: 60, max: 100, bucket: 'general' });

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'gateway'
  });
});

app.use((req, res, next) => {
  if (isPublicRoute(req)) return next();
  return authMiddleware(req, res, next);
});

app.use((req, res, next) => {
  if (isPublicRoute(req)) return authRateLimit(req, res, next);
  return generalRateLimit(req, res, next);
});

app.use(
  '/api/users',
  createProxyMiddleware({
    target: serviceTarget(process.env.USER_SERVICE_URL, '/api/users'),
    changeOrigin: true
  })
);

app.use(
  '/api/restaurants',
  createProxyMiddleware({
    target: serviceTarget(process.env.RESTAURANT_SERVICE_URL, '/api/restaurants'),
    changeOrigin: true
  })
);

app.use(
  '/api/orders',
  createProxyMiddleware({
    target: serviceTarget(process.env.ORDER_SERVICE_URL, '/api/orders'),
    changeOrigin: true
  })
);

app.use(
  '/api/agents',
  createProxyMiddleware({
    target: serviceTarget(process.env.AGENT_SERVICE_URL, '/api/agents'),
    changeOrigin: true
  })
);

app.use(notFoundHandler);
app.use(errorHandler);

// BUG-002: every socket used to connect with no identity check at all.
// This middleware runs before 'connection' fires and rejects the socket
// outright if it doesn't carry a valid JWT — mirroring how every REST
// route already requires one.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (user ${socket.user.id})`);

  // BUG-003: used to accept any orderId with zero ownership check, letting
  // one user subscribe to another user's order tracking/status events.
  // Now it asks Order Service the same question a REST client asking for
  // this order would be asked — reusing the SAME JWT this socket already
  // authenticated with, so the ownership rules (customer owns it /
  // restaurant owns the restaurant it was placed against / agent is the
  // one assigned to it) are enforced in exactly one place, not duplicated.
  socket.on('join-order-room', async (orderId) => {
    if (typeof orderId !== 'string' || !orderId.trim()) return;

    try {
      const response = await fetch(`${process.env.ORDER_SERVICE_URL}/api/orders/internal/${orderId}/tracking-access`, {
        headers: {
          'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET,
          'X-User-Id': socket.user.id
        }
      });

      if (!response.ok) {
        socket.emit('join-order-room:denied', { orderId });
        return;
      }

      socket.join(`order:${orderId}`);
    } catch (error) {
      console.error('[Gateway] join-order-room ownership check failed:', error.message);
      socket.emit('join-order-room:denied', { orderId });
    }
  });

  // BUG-004 / BUG-005: this used to also listen for 'agent-location' and
  // 'order-status' events emitted BY THE CLIENT and rebroadcast them
  // verbatim to the room — meaning any connected browser could fabricate
  // coordinates or a fake order status for anyone else watching that
  // order. There is now no client-writable path into a tracking room at
  // all: both channels below are only ever fed by trusted server-side
  // publishes (Agent Service's location updates, Order Service's
  // validated status transitions), via Redis pub/sub.

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

trackingSubscriber.subscribe('tracking-updates', 'order-status-updates', (err) => {
  if (err) {
    console.error('[Gateway] Failed to subscribe to tracking channels:', err.message);
  } else {
    console.log('[Gateway] Subscribed to tracking-updates and order-status-updates');
  }
});

trackingSubscriber.on('message', (channel, message) => {
  let payload;
  try {
    payload = JSON.parse(message);
  } catch (err) {
    console.error(`[Gateway] Malformed message on ${channel}, skipping:`, err.message);
    return;
  }

  if (channel === 'tracking-updates') {
    io.to(`order:${payload.orderId}`).emit('tracking:update', payload);
  } else if (channel === 'order-status-updates') {
    io.to(`order:${payload.orderId}`).emit('order:status', payload);
  }
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Gateway running on port ${PORT}`);
});
