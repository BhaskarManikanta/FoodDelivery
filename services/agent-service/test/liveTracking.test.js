import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const Redis = (await import('ioredis')).default;
const redis = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

const { updateLocation, reserveNearestAgent } = await import('../src/controllers/agentController.js');

const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const putAgentOnline = async (agentId, lng, lat) => {
  await redis.geoadd('agents:geo', lng, lat, agentId);
  await redis.set(`agents:status:${agentId}`, 'online', 'EX', 300);
};

beforeEach(async () => {
  await redis.flushall();
});

after(async () => {
  await subscriber.quit();
  await redis.quit();
});

test('location update publishes tracking:update payload only for the assigned order', async () => {
  const agentId = 'agent-live-1';
  const orderId = 'order-live-1';
  await putAgentOnline(agentId, 78.4867, 17.3850);
  await reserveNearestAgent(orderId, 78.4867, 17.3850);

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tracking-updates was not published within 2 seconds')), 2000);
    subscriber.subscribe('tracking-updates', (err) => {
      if (err) { clearTimeout(timer); reject(err); }
    });
    subscriber.on('message', (channel, message) => {
      if (channel !== 'tracking-updates') return;
      clearTimeout(timer);
      resolve(JSON.parse(message));
    });
  });

  const res = fakeRes();
  await updateLocation({
    user: { id: agentId },
    body: { orderId, longitude: 78.4901, latitude: 17.3862 }
  }, res);

  const payload = await received;
  assert.equal(res.statusCode, 200);
  assert.equal(payload.orderId, orderId);
  assert.equal(payload.agentId, agentId);
  assert.equal(payload.longitude, 78.4901);
  assert.equal(payload.latitude, 17.3862);
  assert.ok(payload.updatedAt);
});

test('location update rejects an order that is not assigned to the agent', async () => {
  const agentId = 'agent-live-2';
  await putAgentOnline(agentId, 78.4867, 17.3850);
  await reserveNearestAgent('order-owned-by-someone-else', 78.4867, 17.3850);

  const res = fakeRes();
  await updateLocation({
    user: { id: agentId },
    body: { orderId: 'wrong-order', longitude: 78.49, latitude: 17.38 }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'You are not assigned to this order');
});

test('location heartbeat renews a busy agent lease', async () => {
  const agentId = 'agent-live-3';
  const orderId = 'order-live-3';
  await putAgentOnline(agentId, 78.4867, 17.3850);
  await reserveNearestAgent(orderId, 78.4867, 17.3850);

  const before = await redis.ttl(`agents:status:${agentId}`);
  const res = fakeRes();
  await updateLocation({
    user: { id: agentId },
    body: { orderId, longitude: 78.487, latitude: 17.3855 }
  }, res);
  const after = await redis.ttl(`agents:status:${agentId}`);

  assert.equal(res.statusCode, 200);
  assert.equal(await redis.get(`agents:status:${agentId}`), 'busy');
  assert.equal(await redis.get(`agents:current-order:${agentId}`), orderId);
  assert.ok(after > 0);
  assert.ok(after >= before - 2, `expected lease to remain fresh: before=${before}, after=${after}`);
});
