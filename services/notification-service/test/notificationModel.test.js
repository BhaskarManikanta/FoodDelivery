import { test } from 'node:test';
import assert from 'node:assert/strict';
import Notification from '../src/models/Notification.js';

test('Notification model validates required fields', () => {
  const notif = new Notification({
    userId: 'user-123',
    orderId: 'order-456',
    title: 'Order Accepted',
    message: 'Your order has been accepted by the kitchen.',
    type: 'ORDER_ACCEPTED'
  });

  const err = notif.validateSync();
  assert.equal(err, undefined);
  assert.equal(notif.read, false);
  assert.equal(notif.type, 'ORDER_ACCEPTED');
  assert.equal(notif.userId, 'user-123');
  assert.equal(notif.orderId, 'order-456');
});

test('Notification model defaults read to false', () => {
  const notif = new Notification({
    userId: 'user-789',
    orderId: 'order-999',
    type: 'INFO',
    title: 'Out for Delivery',
    message: 'Delivery partner is on the way!'
  });

  assert.equal(notif.read, false);
  assert.equal(notif.type, 'INFO');
});

test('Notification model rejects missing required title, orderId or userId', () => {
  const notif = new Notification({
    message: 'No title or user'
  });

  const err = notif.validateSync();
  assert.ok(err);
  assert.ok(err.errors.userId, 'expected userId required');
  assert.ok(err.errors.orderId, 'expected orderId required');
  assert.ok(err.errors.title, 'expected title required');
});
