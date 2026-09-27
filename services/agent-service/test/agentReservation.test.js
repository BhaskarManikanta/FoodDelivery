import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = 'redis://localhost:6379';

const {
  reserveNearestAgent,
  releaseAgent,
  findAvailableAgentsNear
} = await import('../src/controllers/agentController.js');

// Talk to the SAME real Redis instance the controller uses, to set up
// scenarios and to inspect results directly.
const Redis = (await import('ioredis')).default;
const redis = new Redis(process.env.REDIS_URL);

const putAgentOnline = async (agentId, lng, lat) => {
  await redis.geoadd('agents:geo', lng, lat, agentId);
  await redis.set(`agents:status:${agentId}`, 'online', 'EX', 300);
};

beforeEach(async () => {
  await redis.flushall();
});

after(async () => {
  await redis.quit();
});

test('reserves the nearest of several online agents', async () => {
  // Restaurant at (78.4867, 17.3850). Three agents at increasing distance.
  await putAgentOnline('agent-far', 78.60, 17.50);
  await putAgentOnline('agent-near', 78.49, 17.386);
  await putAgentOnline('agent-mid', 78.55, 17.45);

  const result = await reserveNearestAgent('order-1', 78.4867, 17.385);

  assert.equal(result.agentId, 'agent-near', `expected nearest agent, got ${JSON.stringify(result)}`);

  const status = await redis.get('agents:status:agent-near');
  assert.equal(status, 'busy', 'reserved agent should now be marked busy');

  const claimedOrder = await redis.get('agents:current-order:agent-near');
  assert.equal(claimedOrder, 'order-1');
});

test('two concurrent orders never claim the same single agent (atomicity)', async () => {
  await putAgentOnline('agent-solo', 78.4867, 17.385);

  // Fire two reservation attempts at the exact same time for the ONLY
  // online agent — this is the actual race the Lua script exists to
  // prevent. Exactly one must win.
  const [resultA, resultB] = await Promise.all([
    reserveNearestAgent('order-A', 78.4867, 17.385),
    reserveNearestAgent('order-B', 78.4867, 17.385)
  ]);

  const winners = [resultA, resultB].filter((r) => r !== null);
  assert.equal(winners.length, 1, `expected exactly one winner, got ${JSON.stringify([resultA, resultB])}`);
  assert.equal(winners[0].agentId, 'agent-solo');
});

test('an offline agent is never returned as available', async () => {
  await redis.geoadd('agents:geo', 78.4867, 17.385, 'agent-offline');
  // Deliberately NOT setting a status key -> agent is offline/unknown.

  const available = await findAvailableAgentsNear(78.4867, 17.385, 10);
  assert.equal(available.length, 0);

  const result = await reserveNearestAgent('order-2', 78.4867, 17.385);
  assert.equal(result, null);
});

test('releaseAgent puts a busy agent back online and clears their claim', async () => {
  await putAgentOnline('agent-x', 78.4867, 17.385);
  await reserveNearestAgent('order-3', 78.4867, 17.385);

  assert.equal(await redis.get('agents:status:agent-x'), 'busy');

  await releaseAgent('agent-x');

  assert.equal(await redis.get('agents:status:agent-x'), 'online');
  assert.equal(await redis.get('agents:current-order:agent-x'), null);
});

test('reservation carries a lease TTL (crash recovery)', async () => {
  await putAgentOnline('agent-lease', 78.4867, 17.385);
  await reserveNearestAgent('order-4', 78.4867, 17.385);

  const ttl = await redis.ttl('agents:status:agent-lease');
  assert.ok(ttl > 0 && ttl <= 7200, `expected a bounded lease TTL, got ${ttl}`);
});
