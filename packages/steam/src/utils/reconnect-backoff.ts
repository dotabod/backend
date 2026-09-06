export interface BackoffOptions {
  /** Delay for the first retry (also the growth unit). Default 5s. */
  baseMs?: number
  /** Upper bound on the (pre-jitter) delay. Default 5min. */
  maxMs?: number
  /** Source of randomness in [0, 1); injectable for deterministic tests. */
  random?: () => number
}

export const computeReconnectDelay = function computeReconnectDelay(
  attempt: number,
  opts: BackoffOptions = {}
): number {
  const baseMs = opts.baseMs ?? 5000
  const maxMs = opts.maxMs ?? 300_000
  const random = opts.random ?? Math.random
  // Clamp to >= 1 and cap the exponent so `2 ** n` can never reach Infinity.
  const n = Math.min(Math.max(1, Math.floor(attempt)), 30)
  const exp = Math.min(maxMs, baseMs * 2 ** (n - 1))
  // Equal jitter: half fixed, half random — de-synchronises retries without
  // ever collapsing the delay to ~0.
  return Math.round(exp / 2 + random() * (exp / 2))
}
