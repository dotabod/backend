import { logger } from './logger'

const INTERVAL_MS = 30_000

export function startHeartbeat(): void {
  const pushUrl = process.env.KUMA_PUSH_URL
  if (!pushUrl) {
    logger.warn('KUMA_PUSH_URL not set, uptime heartbeat disabled')
    return
  }

  const ping = async () => {
    try {
      await fetch(`${pushUrl}?status=up&msg=OK`, { signal: AbortSignal.timeout(10_000) })
    } catch (e) {
      logger.error('Failed to send uptime heartbeat', e)
    }
  }

  void ping()
  setInterval(() => void ping(), INTERVAL_MS)
}
