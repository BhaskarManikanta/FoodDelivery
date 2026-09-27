import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JWT_SECRET = 'gateway-proxy-test-secret';
const INTERNAL_SERVICE_SECRET = 'gateway-proxy-internal-secret';
const GATEWAY_PORT = 18081;
const ports = { users: 14101, restaurants: 14102, orders: 14103, agents: 14104 };

const servers = [];
let gateway;
let redis;

function mockService(port, expectedPrefix, response = { ok: true }) {
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith(expectedPrefix)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, path: req.url }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...response, path: req.url, method: req.method }));
  });
  servers.push(server);
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

before(async () => {
  redis = new Redis(REDIS_URL);
  await redis.flushall();

  await mockService(ports.users, '/api/users', { service: 'users' });
  await mockService(ports.restaurants, '/api/restaurants', { service: 'restaurants' });
  await mockService(ports.orders, '/api/orders', { service: 'orders' });
  await mockService(ports.agents, '/api/agents', { service: 'agents' });

  gateway = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(GATEWAY_PORT),
      REDIS_URL,
      JWT_SECRET,
      INTERNAL_SERVICE_SECRET,
      FRONTEND_URL: 'http://localhost:5173',
      USER_SERVICE_URL: `http://127.0.0.1:${ports.users}`,
      RESTAURANT_SERVICE_URL: `http://127.0.0.1:${ports.restaurants}`,
      ORDER_SERVICE_URL: `http://127.0.0.1:${ports.orders}`,
      AGENT_SERVICE_URL: `http://127.0.0.1:${ports.agents}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('gateway did not start')), 5000);
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
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  if (redis) await redis.quit();
});

test('gateway preserves /api/users prefix for login/register', async () => {
  const response = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.service, 'users');
  assert.equal(body.path, '/api/users/login');
});

test('gateway preserves service prefixes for protected routes', async () => {
  const token = jwt.sign({ id: 'user-1', role: 'customer' }, JWT_SECRET);
  const cases = [
    ['/api/restaurants', 'restaurants', '/api/restaurants'],
    ['/api/orders/my-orders', 'orders', '/api/orders/my-orders'],
    ['/api/agents/profile/me', 'agents', '/api/agents/profile/me']
  ];

  for (const [path, service, expectedPath] of cases) {
    const response = await fetch(`http://127.0.0.1:${GATEWAY_PORT}${path}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200, `${path} should not be 404`);
    const body = await response.json();
    assert.equal(body.service, service);
    assert.equal(body.path, expectedPath);
  }
});
