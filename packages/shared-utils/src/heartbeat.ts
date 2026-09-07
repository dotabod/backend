import { logger } from './logger'

interface HeartbeatStatus {
  up: boolean
  msg?: string
}

interface HeartbeatOptions {
  url?: string
  getStatus?: () => HeartbeatStatus | Promise<HeartbeatStatus>
  intervalMs?: number
  debounceMs?: number
  name?: string
}

export const startHeartbeat = function startHeartbeat(opts: HeartbeatOptions = {}): void {
  const {
    url = process.env.KUMA_PUSH_URL,
    getStatus = () => ({ msg: 'OK', up: true }),
    intervalMs = 30_000,
    debounceMs = 0,
    name = 'uptime heartbeat',
  } = opts

  if (url === undefined || url.length === 0) {
    logger.warn(`${name}: push URL not set, heartbeat disabled`)
    return
  }

  let downSince: number | null = null

  const ping = async () => {
    const { up, msg } = await getStatus()

    // Debounce: only report down once continuously down for debounceMs
    let report = up
    if (up) {
      downSince = null
    } else {
      const now = Date.now()
      downSince ??= now
      report = now - downSince < debounceMs
    }

    const status = report ? 'up' : 'down'
    const message = msg ?? (report ? 'OK' : 'down')
    try {
      await fetch(`${url}?status=${status}&msg=${encodeURIComponent(message)}`, {
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      logger.error(`${name}: failed to send heartbeat`, error)
    }
  }

  void ping()
  setInterval(() => void ping(), intervalMs)
}
