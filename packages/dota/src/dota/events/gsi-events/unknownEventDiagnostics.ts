const UNKNOWN_EVENT_LOG_INTERVAL_MS = 60 * 60 * 1000

const unknownEventLogCache = new Map<string, number>()

export function shouldLogUnknownGsiEvent(key: string, now = Date.now()): boolean {
  const lastLogged = unknownEventLogCache.get(key)
  if (lastLogged !== undefined && now - lastLogged < UNKNOWN_EVENT_LOG_INTERVAL_MS) {
    return false
  }

  unknownEventLogCache.set(key, now)
  return true
}

export function __resetUnknownEventLogCacheForTests(): void {
  unknownEventLogCache.clear()
}
