import { randomUUID } from 'crypto';
import Order from './models/Order.js';
import { canTransition, TERMINAL_STATES } from './stateMachine.js';

export const TRANSITION_RESULT = {
  APPLIED: 'APPLIED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  INVALID: 'INVALID',
  NOT_FOUND: 'NOT_FOUND'
};

/**
 * The one place order.status is ever changed after creation. Two things
 * make this the fix for both BUG-008 (illegal transitions) and BUG-021
 * (the cancellation-vs-acceptance race):
 *
 * 1. It checks `canTransition(from, to)` against the state machine before
 *    doing anything, and refuses to move a terminal order at all.
 * 2. The actual write is `findOneAndUpdate({ _id, status: currentStatus })`
 *    — conditional on the exact status this function just read. If a
 *    concurrent request already changed the order's status in between (the
 *    classic "customer cancels at the same instant the restaurant accepts"
 *    race), this match fails and returns null instead of blindly
 *    overwriting whatever the other request decided. The caller sees
 *    INVALID and can retry or surface a conflict — the DB is never left in
 *    a state neither caller intended.
 *
 * If `event` is passed, the outbox entry for that event is pushed onto the
 * SAME atomic document write as the status change (BUG-010) — so "the
 * order changed state" and "there's now a pending event to publish for
 * that" can never get out of sync, even if Kafka is completely
 * unreachable when this runs.
 */
export const applyTransition = async (orderId, toStatus, { event, extraFields = {} } = {}) => {
  const order = await Order.findById(orderId);

  if (!order) {
    return { result: TRANSITION_RESULT.NOT_FOUND };
  }

  if (order.status === toStatus) {
    // Redelivery of an event whose effect was already applied (e.g. a
    // crash happened after the DB write but before the Kafka consumer's
    // markProcessed() call) — a safe no-op, not an error.
    return { result: TRANSITION_RESULT.ALREADY_APPLIED, order };
  }

  if (TERMINAL_STATES.includes(order.status)) {
    return { result: TRANSITION_RESULT.INVALID, order, reason: `Order is already terminal (${order.status})` };
  }

  if (!canTransition(order.status, toStatus)) {
    return { result: TRANSITION_RESULT.INVALID, order, reason: `Cannot go from ${order.status} to ${toStatus}` };
  }

  const push = { statusHistory: { status: toStatus } };

  if (event) {
    push.outbox = {
      eventId: randomUUID(),
      topic: event.topic,
      eventType: event.eventType,
      data: event.data,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date()
    };
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: order.status },
    { $set: { status: toStatus, ...extraFields }, $push: push },
    { new: true }
  );

  if (!updated) {
    return { result: TRANSITION_RESULT.INVALID, reason: 'Concurrent status change on this order — retry' };
  }

  return { result: TRANSITION_RESULT.APPLIED, order: updated };
};
