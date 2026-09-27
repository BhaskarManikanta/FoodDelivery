import { randomUUID } from 'crypto';

/**
 * Builds the standard event envelope used across every service:
 *   { eventId, eventType, version, timestamp, source, data, sagaId }
 *
 * sagaId is the explicit correlation id for the choreography saga this
 * event belongs to. This project runs one saga per order (place order ->
 * restaurant accepts/rejects -> agent assigned/unavailable -> delivery ->
 * terminal state), and every event produced anywhere in that lifecycle
 * carries data.orderId — so sagaId is simply that value, surfaced at the
 * top level instead of buried in `data`. That makes every message on every
 * topic belonging to one saga instance groupable by a single field (log
 * queries, Kafka UI filtering, a future distributed trace) without callers
 * having to know or care that "orderId" is what's playing that role.
 *
 * Using crypto.randomUUID() (Node built-in) instead of the "uuid" package
 * so this shared file has zero external dependencies of its own — it can
 * be safely imported from any service's node_modules-less shared/ folder.
 */
export const buildEvent = (eventType, source, data, version = 1) => ({
  eventId: randomUUID(),
  eventType,
  version,
  timestamp: new Date().toISOString(),
  source,
  sagaId: data?.orderId ?? null,
  data
});
