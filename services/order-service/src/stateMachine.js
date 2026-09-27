/**
 * Centralized order state machine (BUG-008) — this is also the definition
 * of the choreography SAGA that runs this system's core business
 * transaction (placing and fulfilling an order). There is no central
 * orchestrator and no cross-service database transaction: Order Service,
 * Restaurant Service, and Agent Service each perform one local atomic
 * step and publish a fact about it (an event carrying this order's
 * sagaId — see shared/kafka/eventEnvelope.js), and every step downstream
 * reacts only to that fact.
 *
 * Two states are compensating outcomes, not just "another status":
 * reaching CANCELLED from RESTAURANT_PENDING or AGENT_ASSIGNMENT_PENDING
 * means an earlier saga participant said yes but a later one couldn't
 * complete its part (restaurant rejected, or no agent was available) —
 * the saga's actual failure-recovery path is "undo forward" (cancel +
 * notify) rather than "roll back", since there's no shared transaction
 * to roll back in the first place. See transitionOrder.js for where that
 * compensating write actually happens, and kafka.js's
 * handleRestaurantRejected/handleNoAgentAvailable for the two triggers.
 *
 * Every status change in the system — whether triggered by a Kafka event
 * from another service or a direct REST call from the agent app — goes
 * through applyTransition() in transitionOrder.js instead of setting
 * order.status directly. That's what makes "orders can jump straight to
 * DELIVERED" or "orders can move backward" structurally impossible rather
 * than just something callers are supposed to remember not to do.
 */

export const TRANSITIONS = {
  CREATED: ['RESTAURANT_PENDING', 'CANCELLED'],
  RESTAURANT_PENDING: ['RESTAURANT_ACCEPTED', 'CANCELLED'],
  RESTAURANT_ACCEPTED: ['AGENT_ASSIGNMENT_PENDING'],
  AGENT_ASSIGNMENT_PENDING: ['AGENT_ASSIGNED', 'CANCELLED'],
  AGENT_ASSIGNED: ['PICKED_UP'],
  PICKED_UP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: [],
  DELIVERY_FAILED: [],
  CANCELLED: []
};

export const TERMINAL_STATES = ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'];

export const ALL_STATES = Object.keys(TRANSITIONS);

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
