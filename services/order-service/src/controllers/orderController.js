import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import { applyTransition, TRANSITION_RESULT } from '../transitionOrder.js';

const AGENT_STATUS_MAP = {
  PICKED_UP: { topic: 'order-picked-up', eventType: 'ORDER_PICKED_UP' },
  OUT_FOR_DELIVERY: { topic: 'out-for-delivery', eventType: 'OUT_FOR_DELIVERY' },
  DELIVERED: { topic: 'order-delivered', eventType: 'ORDER_DELIVERED' },
  DELIVERY_FAILED: { topic: 'delivery-failed', eventType: 'DELIVERY_FAILED' }
};

// Fetches the authoritative restaurant + menu from Restaurant Service.
// BUG-009/017/018/019 all trace back to the same root cause: the old code
// trusted restaurantId/menuItemId/price/quantity/availability claims from
// the client instead of checking them against the real data. This is the
// single place that's fixed now — every field the client can't be trusted
// on gets re-derived from here.
const fetchAuthoritativeRestaurant = async (restaurantId) => {
  const response = await fetch(`${process.env.RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}`);
  if (!response.ok) return null;
  const body = await response.json();
  return body.data;
};

export const createOrder = asyncHandler(async (req, res) => {
  const { restaurantId, items, deliveryAddress, idempotencyKey } = req.body;

  if (!restaurantId || !mongoose.isValidObjectId(restaurantId)) {
    return res.status(400).json({ success: false, message: 'Valid restaurantId is required' });
  }

  if (!deliveryAddress || typeof deliveryAddress !== 'string' || !deliveryAddress.trim()) {
    return res.status(400).json({ success: false, message: 'deliveryAddress is required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
  }

  // BUG-020: replaying the same Idempotency-Key for this user returns the
  // original order instead of creating a second one (double-click /
  // network-retry safe). The unique index on { userId, idempotencyKey } in
  // the model backs this up against the race where two requests with the
  // same key arrive at nearly the same instant.
  if (idempotencyKey) {
    const existing = await Order.findOne({ userId: req.user.id, idempotencyKey });
    if (existing) {
      return res.status(200).json({ success: true, data: existing, idempotentReplay: true });
    }
  }

  const restaurant = await fetchAuthoritativeRestaurant(restaurantId);

  if (!restaurant) {
    return res.status(400).json({ success: false, message: 'Restaurant not found' });
  }

  if (!restaurant.isOpen) {
    return res.status(400).json({ success: false, message: 'Restaurant is not currently accepting orders' });
  }

  const resolvedItems = [];
  let totalAmount = 0;

  for (const requested of items) {
    const quantity = Number(requested?.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return res.status(400).json({
        success: false,
        message: `Invalid quantity for item ${requested?.menuItemId ?? '(missing id)'}`
      });
    }

    const menuItem = (restaurant.menu || []).find((m) => m._id === requested?.menuItemId);

    if (!menuItem) {
      return res.status(400).json({
        success: false,
        message: `Menu item ${requested?.menuItemId} does not belong to this restaurant`
      });
    }

    if (menuItem.available === false) {
      return res.status(400).json({ success: false, message: `${menuItem.name} is currently unavailable` });
    }

    resolvedItems.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      price: menuItem.price, // server-resolved — the client's price is never used
      quantity
    });
    totalAmount += menuItem.price * quantity;
  }

  const orderId = new mongoose.Types.ObjectId();

  const order = await Order.create({
    _id: orderId,
    userId: req.user.id,
    restaurantId,
    restaurantOwnerId: restaurant.ownerId,
    items: resolvedItems,
    totalAmount,
    deliveryAddress: deliveryAddress.trim(),
    idempotencyKey: idempotencyKey || undefined,
    status: 'RESTAURANT_PENDING',
    statusHistory: [{ status: 'CREATED' }, { status: 'RESTAURANT_PENDING' }],
    // Queued atomically with the order itself — see BUG-010. Even if Kafka
    // is completely down right now, this order is durably recorded as
    // "still needs to tell Restaurant Service about itself."
    outbox: [
      {
        eventId: randomUUID(),
        topic: 'order-created',
        eventType: 'ORDER_CREATED',
        data: {
          orderId: orderId.toString(),
          userId: req.user.id,
          restaurantId,
          totalAmount,
          items: resolvedItems,
          deliveryAddress: deliveryAddress.trim(),
          createdAt: new Date()
        },
        status: 'PENDING',
        attempts: 0,
        createdAt: new Date()
      }
    ]
  });

  res.status(201).json({ success: true, data: order });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ userId: req.user.id })
  ]);

  res.status(200).json({ success: true, data: orders, page, limit, total });
});

export const getRestaurantOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find({ restaurantOwnerId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ restaurantOwnerId: req.user.id })
  ]);

  res.status(200).json({ success: true, data: orders, page, limit, total });
});

export const getAgentOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find({ assignedAgentId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ assignedAgentId: req.user.id })
  ]);

  res.status(200).json({ success: true, data: orders, page, limit, total });
});

// BUG-016: visibility scoped strictly by relationship to the order —
// customer must own it, restaurant must own the restaurant it was placed
// against, agent must be the one assigned to it. No role gets a blanket
// "any order" pass anymore.

// Internal authorization used by the API Gateway before a Socket.IO client
// is allowed to join an order tracking room. The browser never calls this
// endpoint directly; internalOnly protects it with the service secret.
export const authorizeTrackingAccess = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const userId = req.headers['x-user-id'];

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ success: false, authorized: false, message: 'Invalid order id' });
  }

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ success: false, authorized: false, message: 'User identity is required' });
  }

  const order = await Order.findById(orderId).select('userId restaurantOwnerId assignedAgentId');

  if (!order) {
    return res.status(404).json({ success: false, authorized: false });
  }

  const authorized = [order.userId, order.restaurantOwnerId, order.assignedAgentId]
    .filter(Boolean)
    .some((id) => String(id) === userId);

  if (!authorized) {
    return res.status(403).json({ success: false, authorized: false });
  }

  return res.status(200).json({ success: true, authorized: true });
});

export const getOrderById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid order id' });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const { id: userId, role } = req.user;
  const isOwner =
    (role === 'customer' && order.userId === userId) ||
    (role === 'restaurant' && order.restaurantOwnerId === userId) ||
    (role === 'agent' && order.assignedAgentId === userId);

  if (!isOwner) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.status(200).json({ success: true, data: order });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const config = AGENT_STATUS_MAP[status];

  if (!config) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Agent-driven statuses are: ${Object.keys(AGENT_STATUS_MAP).join(', ')}`
    });
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // BUG-007: this used to be `if (order.assignedAgentId && order.assignedAgentId !== req.user.id)`
  // — when assignedAgentId was null, the check was skipped entirely, so
  // ANY authenticated agent could claim and update an order nobody had
  // been assigned to yet. It must always equal the requester, full stop.
  if (order.assignedAgentId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'You are not the agent assigned to this order' });
  }

  const result = await applyTransition(req.params.id, status, {
    event: {
      topic: config.topic,
      eventType: config.eventType,
      data: {
        orderId: order._id.toString(),
        userId: order.userId,
        restaurantId: order.restaurantId,
        agentId: order.assignedAgentId,
        status
      }
    }
  });

  if (result.result === TRANSITION_RESULT.NOT_FOUND) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (result.result === TRANSITION_RESULT.INVALID) {
    return res.status(409).json({ success: false, message: result.reason || 'Invalid status transition' });
  }

  res.status(200).json({ success: true, data: result.order });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (order.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  // The atomic conditional update inside applyTransition is what actually
  // closes the cancel-vs-accept race (BUG-021) — if the restaurant's
  // acceptance event lands in the database a moment before this request's
  // write executes, the conditional match fails and this returns 409
  // instead of the order ending up simultaneously accepted AND cancelled.
  const result = await applyTransition(req.params.id, 'CANCELLED', {
    event: {
      topic: 'order-cancelled',
      eventType: 'ORDER_CANCELLED',
      data: {
        orderId: order._id.toString(),
        userId: order.userId,
        restaurantId: order.restaurantId,
        agentId: order.assignedAgentId,
        reason: 'CUSTOMER_CANCELLED'
      }
    }
  });

  if (result.result === TRANSITION_RESULT.INVALID) {
    return res.status(409).json({
      success: false,
      message: result.reason || 'Order can no longer be cancelled'
    });
  }

  res.status(200).json({ success: true, data: result.order });
});
