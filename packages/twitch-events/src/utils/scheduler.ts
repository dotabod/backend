/**
 * Schedule an async function to run every `intervalMs`, skipping ticks while
 * a previous invocation is still in flight. Returns a `stop` function that
 * clears the interval.
 *
 * The plain `setInterval(fn, ms)` pattern lets ticks pile up if `fn()` runs
 * longer than the interval — concurrent runs race on shared state (e.g.
 * `eventSubMap`, the global rate limiter) and burn duplicate Twitch API
 * quota. This helper guards against that.
 */
export function scheduleNonOverlapping(fn: () => Promise<unknown>, intervalMs: number): () => void {
  let inFlight = false
  const handle = setInterval(() => {
    if (inFlight) return
    inFlight = true
    Promise.resolve()
      .then(fn)
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
      })
  }, intervalMs)
  return () => clearInterval(handle)
}
