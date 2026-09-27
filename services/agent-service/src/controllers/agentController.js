import asyncHandler from 'express-async-handler';
import Redis from 'ioredis';
import Agent from '../models/Agent.js';

const redis = new Redis(process.env.REDIS_URL);

const AGENT_GEO_KEY = 'agents:geo';
const AGENT_STATUS_KEY_PREFIX = 'agents:status:'; // agents:status:<agentId> -> 'online' | 'busy' (with TTL)
const AGENT_ORDER_KEY_PREFIX = 'agents:current-order:'; // agents:current-order:<agentId> -> orderId (with TTL)

// How long an agent is considered "online" without a fresh location/status
// ping — if the agent's app goes silent (crashed, lost connectivity,
// force-quit) for longer than this, they naturally fall out of the
// available pool without needing an explicit heartbeat sweep job.
const ONLINE_TTL_SECONDS = 5 * 60;

// How long a 'busy' reservation is held before it self-expires (BUG-014:
// crash recovery for agent reservation). Every location ping from an
// actively-working agent renews this lease (see updateLocation below), so
// a genuinely active delivery never expires mid-flight — only an agent
// whose app has actually stopped reporting in will fall back to available
// after this window, instead of staying stuck "busy" forever.
const BUSY_LEASE_SECONDS = 2 * 60 * 60;

const statusKey = (agentId) => `${AGENT_STATUS_KEY_PREFIX}${agentId}`;
const orderKey = (agentId) => `${AGENT_ORDER_KEY_PREFIX}${agentId}`;

// Atomically flips an agent from 'online' to 'busy' (with a lease TTL) and
// records which order claimed it — a Lua script so the check-then-set is a
// single indivisible Redis operation, preventing two orders from racing to
// claim the same agent.
const CLAIM_AGENT_SCRIPT = `
local currentStatus = redis.call('GET', KEYS[1])
if currentStatus == 'online' then
  redis.call('SET', KEYS[1], 'busy', 'EX', ARGV[2])
  redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
  return 1
else
  return 0
end
`;

export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const { name, phone, vehicleType } = req.body;

  const agent = await Agent.findOneAndUpdate(
    { userId: req.user.id },
    { userId: req.user.id, name, phone, vehicleType },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: agent });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({ userId: req.user.id });

  if (!agent) {
    return res.status(404).json({ success: false, message: 'Profile not set up yet' });
  }

  res.status(200).json({ success: true, data: agent });
});

export const setOnlineStatus = asyncHandler(async (req, res) => {
  const { online } = req.body;

  if (online) {
    await redis.set(statusKey(req.user.id), 'online', 'EX', ONLINE_TTL_SECONDS);
  } else {
    await redis.del(statusKey(req.user.id));
  }

  res.status(200).json({
    success: true,
    data: { agentId: req.user.id, online: !!online }
  });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const { longitude, latitude, orderId } = req.body;

  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return res.status(400).json({ success: false, message: 'Invalid coordinates' });
  }

  await redis.geoadd(AGENT_GEO_KEY, longitude, latitude, req.user.id);

  const currentStatus = await redis.get(statusKey(req.user.id));

  // A location ping is also a heartbeat: refresh whichever lease is
  // currently active (online freshness, or the busy reservation lease)
  // instead of clobbering it. An agent who's actively pinging location
  // while on a delivery keeps their busy lease alive; one who's gone
  // silent lets it expire.
  if (currentStatus === 'online') {
    await redis.set(statusKey(req.user.id), 'online', 'EX', ONLINE_TTL_SECONDS);
  } else if (currentStatus === 'busy') {
    await redis.set(statusKey(req.user.id), 'busy', 'EX', BUSY_LEASE_SECONDS);
    if (orderId) await redis.set(orderKey(req.user.id), orderId, 'EX', BUSY_LEASE_SECONDS);
  } else {
    await redis.set(statusKey(req.user.id), 'online', 'EX', ONLINE_TTL_SECONDS);
  }

  if (orderId) {
    // BUG-015: an agent can only publish tracking for the order Redis
    // itself recorded them as claimed for — not any orderId the client
    // happens to send. This is checked against agent-service's own
    // reservation record, so it needs no network call to Order Service.
    const claimedOrderId = await redis.get(orderKey(req.user.id));
    if (claimedOrderId !== orderId) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this order' });
    }

    await redis.publish(
      'tracking-updates',
      JSON.stringify({
        orderId,
        agentId: req.user.id,
        longitude,
        latitude,
        updatedAt: new Date().toISOString()
      })
    );
  }

  res.status(200).json({
    success: true,
    data: { agentId: req.user.id, longitude, latitude }
  });
});

// Shared by the manual internal endpoint below and the Kafka-driven
// auto-assignment flow in kafka.js.
export const findAvailableAgentsNear = async (longitude, latitude, radiusKm = 10) => {
  const nearby = await redis.georadius(AGENT_GEO_KEY, longitude, latitude, radiusKm, 'km', 'WITHDIST', 'ASC');
  const available = [];

  for (const [agentId, distance] of nearby) {
    const status = await redis.get(statusKey(agentId));
    if (status === 'online') {
      available.push({ agentId, distance: Number(distance) });
    }
  }

  return available;
};

export const reserveNearestAgent = async (orderId, longitude, latitude, radiusKm = 10) => {
  const candidates = await findAvailableAgentsNear(longitude, latitude, radiusKm);

  for (const candidate of candidates) {
    const claimed = await redis.eval(
      CLAIM_AGENT_SCRIPT,
      2,
      statusKey(candidate.agentId),
      orderKey(candidate.agentId),
      orderId,
      BUSY_LEASE_SECONDS
    );

    if (claimed === 1) {
      return { agentId: candidate.agentId, distance: candidate.distance };
    }
  }

  return null;
};

// Idempotent by design — safe to call more than once for the same agent
// (e.g. a retried Kafka message), and safe to call for an agent whose
// lease already expired on its own (BUG-013/BUG-014).
export const releaseAgent = async (agentId) => {
  await redis.set(statusKey(agentId), 'online', 'EX', ONLINE_TTL_SECONDS);
  await redis.del(orderKey(agentId));
};

// Internal-only (see shared/auth/internalOnly.js) — this used to be
// reachable by any authenticated user (BUG-023), leaking which agents are
// online and roughly where they are. Only the dispatch flow needs it.
export const findNearestAgents = asyncHandler(async (req, res) => {
  const { longitude, latitude, radius = 5 } = req.query;
  const available = await findAvailableAgentsNear(Number(longitude), Number(latitude), Number(radius));

  res.status(200).json({ success: true, data: available });
});

// Internal-only (BUG-006) — this is a manual override for the normal
// Kafka-driven auto-assignment flow, not something any logged-in customer
// should be able to trigger for an arbitrary order.
export const assignNearestAgent = asyncHandler(async (req, res) => {
  const { orderId, longitude, latitude } = req.body;
  const assignedAgent = await reserveNearestAgent(orderId, Number(longitude), Number(latitude));

  if (!assignedAgent) {
    return res.status(404).json({ success: false, message: 'No nearby available agents found' });
  }

  res.status(200).json({ success: true, data: { orderId, assignedAgent } });
});
