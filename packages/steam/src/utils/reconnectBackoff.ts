export interface BackoffOptions {
  /** Delay for the first retry (also the growth unit). Default 5s. */
  baseMs?: number
  /** Upper bound on the (pre-jitter) delay. Default 5min. */
  maxMs?: number
  /** Source of randomness in [0, 1); injectable for deterministic tests. */
  random?: () => number
}

/**
 * Exponential backoff with equal jitter, capped.
 *
 * Steam rate-limits account/IP logons aggressively and signals it with soft
 * rejections (TryAnotherCM / InvalidPassword / InvalidParam). The node-steam
 * client has no built-in reconnect, so the app drives it — and reconnecting
 * immediately turns a single dropped CM connection into a self-sustaining login
 * storm that keeps the rate-limit active indefinitely. Backing off lets the
 * limit lapse so the account can log back in.
 *
 * `attempt` is 1-based: the first reconnect after a healthy session is 1.
 * The returned delay lands in `[exp/2, exp]` where
 * `exp = min(maxMs, baseMs * 2 ** (attempt - 1))`.
 */
export function computeReconnectDelay(attempt: number, opts: BackoffOptions = {}): number {
  const baseMs = opts.baseMs ?? 5_000
  const maxMs = opts.maxMs ?? 300_000
  const random = opts.random ?? Math.random
  // Clamp to >= 1 and cap the exponent so `2 ** n` can never reach Infinity.
  const n = Math.min(Math.max(1, Math.floor(attempt)), 30)
  const exp = Math.min(maxMs, baseMs * 2 ** (n - 1))
  // Equal jitter: half fixed, half random — de-synchronises retries without
  // ever collapsing the delay to ~0.
  return Math.round(exp / 2 + random() * (exp / 2))
}
