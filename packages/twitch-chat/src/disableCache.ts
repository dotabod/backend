import { logger } from '@dotabod/shared-utils'

export const DISABLE_CACHE_EXPIRY = 30000 // 30 seconds

export const disableUserCache = new Map<
  string,
  { timestamp: number; dropReason: string; providerAccountId: string }
>()

export function clearDisableCache(userId: string) {
  const keysToDelete: string[] = []
  for (const key of disableUserCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key)
    }
  }

  for (const key of keysToDelete) {
    disableUserCache.delete(key)
  }

  if (keysToDelete.length > 0) {
    logger.info('[DISABLE_CACHE] Cleared cache for user', {
      userId,
      clearedKeys: keysToDelete.length,
    })
  }
}

export function isUserBeingDisabled(userId: string): boolean {
  const now = Date.now()

  for (const [key, value] of disableUserCache.entries()) {
    if (key.startsWith(`${userId}:`) && now - value.timestamp < DISABLE_CACHE_EXPIRY) {
      return true
    }
  }

  return false
}

export function isBroadcasterBeingDisabled(providerAccountId: string): boolean {
  const now = Date.now()

  for (const [_key, value] of disableUserCache.entries()) {
    if (
      value.providerAccountId === providerAccountId &&
      now - value.timestamp < DISABLE_CACHE_EXPIRY
    ) {
      return true
    }
  }

  return false
}
