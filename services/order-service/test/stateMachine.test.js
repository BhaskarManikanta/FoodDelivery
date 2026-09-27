import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, TERMINAL_STATES } from '../src/stateMachine.js';

test('the full happy path is legal, step by step', () => {
  const path = [
    'CREATED', 'RESTAURANT_PENDING', 'RESTAURANT_ACCEPTED',
    'AGENT_ASSIGNMENT_PENDING', 'AGENT_ASSIGNED', 'PICKED_UP',
    'OUT_FOR_DELIVERY', 'DELIVERED'
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]} should be legal`);
  }
});

test('an order cannot jump straight from CREATED to DELIVERED', () => {
  assert.equal(canTransition('CREATED', 'DELIVERED'), false);
});

test('an order cannot move backward', () => {
  assert.equal(canTransition('AGENT_ASSIGNED', 'RESTAURANT_PENDING'), false);
  assert.equal(canTransition('DELIVERED', 'OUT_FOR_DELIVERY'), false);
});

test('terminal states have no outgoing transitions at all', () => {
  for (const state of TERMINAL_STATES) {
    assert.equal(canTransition(state, 'CREATED'), false);
    assert.equal(canTransition(state, 'RESTAURANT_PENDING'), false);
  }
});

test('cancellation is only legal from the early, pre-commitment states', () => {
  assert.ok(canTransition('CREATED', 'CANCELLED'));
  assert.ok(canTransition('RESTAURANT_PENDING', 'CANCELLED'));
  assert.ok(canTransition('AGENT_ASSIGNMENT_PENDING', 'CANCELLED'));
  assert.equal(canTransition('AGENT_ASSIGNED', 'CANCELLED'), false, 'cannot cancel once an agent is committed');
  assert.equal(canTransition('OUT_FOR_DELIVERY', 'CANCELLED'), false);
});
