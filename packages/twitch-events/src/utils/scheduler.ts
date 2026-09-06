export const scheduleNonOverlapping = function scheduleNonOverlapping(
  fn: () => Promise<unknown>,
  intervalMs: number
): () => void {
  let inFlight = false
  const handle = setInterval(() => {
    if (inFlight) {
      return
    }
    inFlight = true
    Promise.resolve()
      .then(fn)
      .catch(() => {})
      .finally(() => {
        inFlight = false
      })
  }, intervalMs)
  return () => {
    clearInterval(handle)
  }
}
