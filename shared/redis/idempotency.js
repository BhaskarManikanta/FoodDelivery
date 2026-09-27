/**
 * Consumer-side duplicate-delivery guard — INBOX pattern.
 *
 * Kafka's at-least-once delivery means every consumer can see the same
 * message more than once. The version of this file used earlier in this
 * project had a real bug (flagged in the bug report as BUG-011): it used
 * `SET key NX` to claim an eventId as "seen" *before* running any business
 * logic. That means if the process crashed partway through handling the
 * event — after the claim succeeded but before the DB write completed —
 * the event would be marked done anyway, and a Kafka redelivery of that
 * exact message would be silently skipped forever. The business effect it
 * was supposed to have never happens, and there's no way to recover it.
 *
 * The fix is to separate "have I already finished this?" (checked first)
 * from "I just finished this" (recorded only after business logic
 * succeeds):
 *
 *   if (await wasAlreadyProcessed(...)) return;   // skip real duplicates
 *   ... do the actual DB writes / Kafka publishes ...
 *   await markProcessed(...);                     // only on success
 *
 * This does reopen a narrow window (a crash between the DB write and
 * markProcessed will cause one legitimate reprocessing on redelivery), but
 * that's the correct trade-off: it's recoverable at-least-once processing
 * instead of an unrecoverable silent drop. It's also why every consumer in
 * this project performs its actual state changes through conditional/
 * atomic operations (Order Service's state-machine transitions, Agent
 * Service's Lua-script reservation) — reprocessing an already-applied
 * change safely no-ops instead of double-applying it.
 */
export const wasAlreadyProcessed = async (redisClient, consumerGroupId, eventId) => {
  const value = await redisClient.get(`processed-event:${consumerGroupId}:${eventId}`);
  return value === 'done';
};

export const markProcessed = async (redisClient, consumerGroupId, eventId, ttlSeconds = 86400) => {
  await redisClient.set(`processed-event:${consumerGroupId}:${eventId}`, 'done', 'EX', ttlSeconds);
};
