import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret';

// In-memory fake standing in for the Mongo collection. Mimics just the
// Mongoose surface orderController.js / transitionOrder.js actually call.
let store;

const makeFakeOrderModel = () => ({
  create: async (doc) => {
    const record = { ...doc, _id: doc._id?.toString?.() ?? doc._id ?? `fake-${store.size + 1}` };
    store.set(record._id.toString(), record);
    return record;
  },
  findOne: async (filter) => {
    for (const rec of store.values()) {
      if (filter.userId && rec.userId !== filter.userId) continue;
      if (filter.idempotencyKey && rec.idempotencyKey !== filter.idempotencyKey) continue;
      return rec;
    }
    return null;
  },
  findById: async (id) => store.get(id.toString()) || null,
  findOneAndUpdate: async (filter, update) => {
    const rec = store.get(filter._id.toString());
    if (!rec) return null;
    // The exact conditional-match behavior applyTransition() relies on to
    // close the cancel-vs-accept race.
    if (filter.status !== undefined && rec.status !== filter.status) return null;
    const next = { ...rec };
    if (update.$set) Object.assign(next, update.$set);
    if (update.$push) {
      for (const key of Object.keys(update.$push)) {
        next[key] = [...(rec[key] || []), update.$push[key]];
      }
    }
    store.set(filter._id.toString(), next);
    return next;
  }
});

const OrderModel = makeFakeOrderModel();
mock.module('../src/models/Order.js', { defaultExport: OrderModel });

const { createOrder, updateOrderStatus, cancelOrder } = await import('../src/controllers/orderController.js');

const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const RESTAURANT_ID = new mongoose.Types.ObjectId().toString();

const FAKE_RESTAURANT = {
  _id: RESTAURANT_ID,
  ownerId: 'owner-1',
  isOpen: true,
  menu: [
    { _id: 'item-1', name: 'Paneer Butter Masala', price: 220, available: true },
    { _id: 'item-2', name: 'Garlic Naan', price: 45, available: true },
    { _id: 'item-3', name: 'Sold Out Curry', price: 999, available: false }
  ]
};

beforeEach(() => {
  store = new Map();
  Object.assign(OrderModel, makeFakeOrderModel());
  // Stub the global fetch createOrder uses to reach Restaurant Service.
  globalThis.fetch = async (url) => {
    if (url.includes(RESTAURANT_ID)) {
      return { ok: true, json: async () => ({ data: FAKE_RESTAURANT }) };
    }
    return { ok: false, json: async () => ({}) };
  };
});

test('createOrder computes price from the server menu, ignoring any client price', async () => {
  const req = {
    user: { id: 'user-1', role: 'customer' },
    body: {
      restaurantId: RESTAURANT_ID,
      // A client-submitted price/total, which must be completely ignored.
      items: [{ menuItemId: 'item-1', quantity: 2, price: 1 }],
      totalAmount: 1,
      deliveryAddress: '123 Main St'
    }
  };
  const res = fakeRes();

  await createOrder(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.totalAmount, 440, 'expected 2x220 from the REAL menu price, not the client-submitted 1');
  assert.equal(res.body.data.status, 'RESTAURANT_PENDING');
  assert.equal(res.body.data.outbox[0].eventType, 'ORDER_CREATED');
  assert.equal(res.body.data.outbox[0].status, 'PENDING');
});

test('createOrder rejects an item that does not belong to the restaurant', async () => {
  const req = {
    user: { id: 'user-1', role: 'customer' },
    body: { restaurantId: RESTAURANT_ID, items: [{ menuItemId: 'not-a-real-item', quantity: 1 }], deliveryAddress: 'x' }
  };
  const res = fakeRes();
  await createOrder(req, res, (e) => { if (e) throw e; });
  assert.equal(res.statusCode, 400);
});

test('createOrder rejects an unavailable item', async () => {
  const req = {
    user: { id: 'user-1', role: 'customer' },
    body: { restaurantId: RESTAURANT_ID, items: [{ menuItemId: 'item-3', quantity: 1 }], deliveryAddress: 'x' }
  };
  const res = fakeRes();
  await createOrder(req, res, (e) => { if (e) throw e; });
  assert.equal(res.statusCode, 400);
});

test('createOrder rejects a non-integer / out-of-range quantity', async () => {
  for (const badQty of [0, -1, 1.5, 51]) {
    const req = {
      user: { id: 'user-1', role: 'customer' },
      body: { restaurantId: RESTAURANT_ID, items: [{ menuItemId: 'item-1', quantity: badQty }], deliveryAddress: 'x' }
    };
    const res = fakeRes();
    await createOrder(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 400, `quantity ${badQty} should have been rejected`);
  }
});

test('createOrder replays the same idempotencyKey instead of creating a duplicate', async () => {
  const body = {
    restaurantId: RESTAURANT_ID,
    items: [{ menuItemId: 'item-2', quantity: 1 }],
    deliveryAddress: 'x',
    idempotencyKey: 'same-key-123'
  };
  const res1 = fakeRes();
  await createOrder({ user: { id: 'user-1', role: 'customer' }, body }, res1, (e) => { if (e) throw e; });

  const res2 = fakeRes();
  await createOrder({ user: { id: 'user-1', role: 'customer' }, body }, res2, (e) => { if (e) throw e; });

  assert.equal(store.size, 1, 'a replayed idempotency key must not create a second order');
  assert.equal(res2.body.data._id, res1.body.data._id);
  assert.equal(res2.body.idempotentReplay, true);
});

// This is a direct regression test for BUG-007: the old code was
// `if (order.assignedAgentId && order.assignedAgentId !== req.user.id)`,
// which SKIPPED the check entirely when assignedAgentId was null — letting
// any authenticated agent claim and update an order nobody was assigned
// to yet.
test('BUG-007 regression: an unassigned agent cannot update an order with no assignedAgentId', async () => {
  await OrderModel.create({
    _id: 'order-unassigned',
    userId: 'user-1',
    restaurantOwnerId: 'owner-1',
    assignedAgentId: null,
    status: 'AGENT_ASSIGNED',
    statusHistory: [],
    outbox: []
  });

  const req = {
    user: { id: 'some-random-agent', role: 'agent' },
    params: { id: 'order-unassigned' },
    body: { status: 'PICKED_UP' }
  };
  const res = fakeRes();
  await updateOrderStatus(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
});

test('the actually-assigned agent CAN update the order', async () => {
  await OrderModel.create({
    _id: 'order-assigned',
    userId: 'user-1',
    restaurantOwnerId: 'owner-1',
    assignedAgentId: 'agent-7',
    status: 'AGENT_ASSIGNED',
    statusHistory: [],
    outbox: []
  });

  const req = {
    user: { id: 'agent-7', role: 'agent' },
    params: { id: 'order-assigned' },
    body: { status: 'PICKED_UP' }
  };
  const res = fakeRes();
  await updateOrderStatus(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, 'PICKED_UP');
});

test('an illegal status transition is rejected with 409, not silently applied', async () => {
  await OrderModel.create({
    _id: 'order-early',
    userId: 'user-1',
    restaurantOwnerId: 'owner-1',
    assignedAgentId: 'agent-7',
    status: 'RESTAURANT_PENDING', // agent can't have anything to do yet
    statusHistory: [],
    outbox: []
  });

  const req = {
    user: { id: 'agent-7', role: 'agent' },
    params: { id: 'order-early' },
    body: { status: 'DELIVERED' } // way out of order
  };
  const res = fakeRes();
  await updateOrderStatus(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 409, JSON.stringify(res.body));
});

test('cancelOrder succeeds while the order is still cancellable', async () => {
  await OrderModel.create({
    _id: 'order-cancel-ok',
    userId: 'user-1',
    restaurantOwnerId: 'owner-1',
    assignedAgentId: null,
    status: 'RESTAURANT_PENDING',
    statusHistory: [],
    outbox: []
  });

  const req = { user: { id: 'user-1' }, params: { id: 'order-cancel-ok' } };
  const res = fakeRes();
  await cancelOrder(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.status, 'CANCELLED');
});

test('cancelOrder is rejected once the order is past the cancellable window', async () => {
  await OrderModel.create({
    _id: 'order-cancel-too-late',
    userId: 'user-1',
    restaurantOwnerId: 'owner-1',
    assignedAgentId: 'agent-7',
    status: 'AGENT_ASSIGNED',
    statusHistory: [],
    outbox: []
  });

  const req = { user: { id: 'user-1' }, params: { id: 'order-cancel-too-late' } };
  const res = fakeRes();
  await cancelOrder(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 409, JSON.stringify(res.body));
});

test('a customer cannot cancel someone else\'s order', async () => {
  await OrderModel.create({
    _id: 'order-not-yours',
    userId: 'the-real-owner',
    restaurantOwnerId: 'owner-1',
    status: 'CREATED',
    statusHistory: [],
    outbox: []
  });

  const req = { user: { id: 'an-attacker' }, params: { id: 'order-not-yours' } };
  const res = fakeRes();
  await cancelOrder(req, res, (e) => { if (e) throw e; });

  assert.equal(res.statusCode, 403);
});
