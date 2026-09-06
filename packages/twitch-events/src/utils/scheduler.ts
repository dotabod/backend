export const scheduleNonOverlapping = function scheduleNonOverlapping(
  fn: () => Promise<void>,
  intervalMs: number
): () => void {
  let inFlight = false

  const runTask = async function runTask(): Promise<void> {
    inFlight = true
    try {
      await fn()
    } catch {
      // Task failures are isolated so later intervals can still run.
    } finally {
      inFlight = false
    }
  }

  const handle = setInterval(() => {
    if (inFlight) {
      return
    }
    void runTask()
  }, intervalMs)

  return () => {
    clearInterval(handle)
  }
}
