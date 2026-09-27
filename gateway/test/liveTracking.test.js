import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { io as ioClient } from 'socket.io-client';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JWT_SECRET = 'live-tracking-test-secret';
const GATEWAY_PORT = 18080;
const ORDER_PORT = 14003;
const INTERNAL_SERVICE_SECRET = 'tracking-internal-secret';

let redis;
let mockOrderServer;
let gateway;

before(async () => {
  redis = new Redis(REDIS_URL);
  await redis.flushall();

  mockOrderServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/api/orders/internal/')) {
      const orderId = req.url.split('/')[4];
      const authorized = req.headers['x-internal-secret'] === INTERNAL_SERVICE_SECRET &&
        req.headers['x-user-id'] === 'customer-live' && orderId === 'order-gateway-live-1';
      res.writeHead(authorized ? 200 : 403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: authorized, authorized }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => mockOrderServer.listen(ORDER_PORT, '127.0.0.1', resolve));

  gateway = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(GATEWAY_PORT),
      REDIS_URL,
      JWT_SECRET,
      FRONTEND_URL: 'http://localhost:5173',
      USER_SERVICE_URL: 'http://127.0.0.1:14001',
      RESTAURANT_SERVICE_URL: 'http://127.0.0.1:14002',
      ORDER_SERVICE_URL: `http://127.0.0.1:${ORDER_PORT}`,
      INTERNAL_SERVICE_SECRET,
      AGENT_SERVICE_URL: 'http://127.0.0.1:14004'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('gateway did not start within 5 seconds')), 5000);
    gateway.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`Gateway running on port ${GATEWAY_PORT}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    gateway.once('error', (err) => { clearTimeout(timeout); reject(err); });
  });
});

after(async () => {
  if (gateway && !gateway.killed) gateway.kill('SIGTERM');
  if (mockOrderServer) await new Promise((resolve) => mockOrderServer.close(resolve));
  if (redis) await redis.quit();
});

test('gateway forwards trusted Redis tracking updates to the correct Socket.IO order room', async () => {
  const token = jwt.sign({ id: 'customer-live', role: 'customer' }, JWT_SECRET);
  const orderId = 'order-gateway-live-1';
  const socket = ioClient(`http://127.0.0.1:${GATEWAY_PORT}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connection timeout')), 3000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', reject);
    });

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tracking:update not received within 3 seconds')), 3000);
      socket.once('tracking:update', (payload) => { clearTimeout(timer); resolve(payload); });
    });

    socket.emit('join-order-room', orderId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await redis.publish('tracking-updates', JSON.stringify({
      orderId,
      agentId: 'agent-live-gateway',
      longitude: 78.4922,
      latitude: 17.3877,
      updatedAt: new Date().toISOString()
    }));

    const payload = await received;
    assert.equal(payload.orderId, orderId);
    assert.equal(payload.agentId, 'agent-live-gateway');
    assert.equal(payload.longitude, 78.4922);
    assert.equal(payload.latitude, 17.3877);
  } finally {
    socket.close();
  }
});

test('gateway rejects an authenticated user from another users order room', async () => {
  const token = jwt.sign({ id: 'another-user', role: 'customer' }, JWT_SECRET);
  const socket = ioClient(`http://127.0.0.1:${GATEWAY_PORT}`, {
    auth: { token }, transports: ['websocket'], reconnection: false
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connection timeout')), 3000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', reject);
    });
    const denied = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tracking room was not denied')), 2000);
      socket.once('join-order-room:denied', (payload) => { clearTimeout(timer); resolve(payload); });
    });
    socket.emit('join-order-room', 'order-gateway-live-1');
    const payload = await denied;
    assert.equal(payload.orderId, 'order-gateway-live-1');

    const received = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 500);
      socket.once('tracking:update', () => { clearTimeout(timer); resolve(true); });
    });
    await redis.publish('tracking-updates', JSON.stringify({ orderId: 'order-gateway-live-1', agentId: 'agent-x', latitude: 1, longitude: 2 }));
    assert.equal(await received, false);
  } finally {
    socket.close();
  }
});

test('gateway rejects unauthenticated Socket.IO clients', async () => {
  const socket = ioClient(`http://127.0.0.1:${GATEWAY_PORT}`, {
    transports: ['websocket'],
    reconnection: false
  });
  try {
    const error = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('expected authentication failure')), 2000);
      socket.once('connect_error', (err) => { clearTimeout(timer); resolve(err); });
    });
    assert.match(error.message, /Authentication required/);
  } finally {
    socket.close();
  }
});
