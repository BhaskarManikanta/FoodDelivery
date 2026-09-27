/**
 * Sends a message that failed processing to a dead-letter topic instead of
 * silently dropping it (BUG-032/033). Every consumer in this project wraps
 * its business logic in a try/catch; on failure, it calls this instead of
 * just console.error-and-return, so a poison message is preserved with
 * enough metadata (which topic, which consumer, why it failed, how many
 * times it's been retried) for a human to inspect and replay later instead
 * of vanishing.
 *
 * This does bounded in-process retry + DLQ, not a full retry-topic chain
 * with backoff — a reasonable middle ground for a project this size. A
 * larger production system would typically use a chain of retry topics
 * with increasing delay before finally landing in the DLQ.
 */
export const sendToDeadLetter = async (producer, originalTopic, rawMessage, error, meta = {}) => {
  const dlqTopic = `${originalTopic}.dlq`;

  try {
    await producer.send({
      topic: dlqTopic,
      messages: [
        {
          value: JSON.stringify({
            originalTopic,
            failedAt: new Date().toISOString(),
            error: error?.message || String(error),
            consumerGroup: meta.consumerGroup || 'unknown',
            attempts: meta.attempts ?? 1,
            rawMessage: rawMessage?.toString() ?? null
          })
        }
      ]
    });
    console.error(`[DLQ] Sent failed message from ${originalTopic} to ${dlqTopic}: ${error?.message}`);
  } catch (dlqError) {
    // If even the DLQ publish fails, this is as far as we can go without a
    // durable local fallback (e.g. writing to disk/DB) — log loudly so it's
    // at least visible in the service's logs rather than lost silently.
    console.error(`[DLQ] FAILED to publish to ${dlqTopic} — message is now only in these logs:`, {
      originalTopic,
      error: error?.message,
      dlqError: dlqError?.message,
      rawMessage: rawMessage?.toString()
    });
  }
};

/**
 * Bounded retry wrapper for a consumer's per-message handler. Retries the
 * handler a few times with a short backoff before giving up and sending to
 * the DLQ — covers transient failures (a momentary DB blip) without
 * retrying forever on a message that will never succeed (a genuinely
 * malformed payload).
 */
export const withRetryAndDeadLetter = async (handler, { producer, topic, message, consumerGroup, maxAttempts = 3 }) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await handler();
      return;
    } catch (error) {
      lastError = error;
      console.error(`[${consumerGroup}] Attempt ${attempt}/${maxAttempts} failed for ${topic}:`, error.message);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  await sendToDeadLetter(producer, topic, message.value, lastError, { consumerGroup, attempts: maxAttempts });
};
