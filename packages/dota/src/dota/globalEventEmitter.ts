import { EventEmitter } from 'node:events'
import type { NextFunction, Request, Response } from 'express'

export const events = new EventEmitter()

// I dont think we need 20, but just in case. Default is 11
events.setMaxListeners(20)

// Track which event names we've seeded initially per token to ensure
// handlers receive an initial value even when GSI doesn't flag changes yet.
type SeedCacheEntry = { events: Set<string>; ts: number }
const seededEventsByKey = new Map<string, SeedCacheEntry>()
const currentMatchIdByToken = new Map<string, string>()

const GAME_STATE_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const GAME_STATE_CACHE_MAX_SIZE = 5000
const GAME_STATE_CACHE_CLEANUP_MS = 15 * 60 * 1000 // 15 minutes

function pruneCaches() {
  const now = Date.now()
  // Remove expired entries
  for (const [key, entry] of seededEventsByKey.entries()) {
    if (now - entry.ts > GAME_STATE_CACHE_TTL_MS) {
      seededEventsByKey.delete(key)
    }
  }
  // Clean up currentMatchIdByToken for tokens with no seeded events
  for (const [token] of currentMatchIdByToken.entries()) {
    const hasSeeded = Array.from(seededEventsByKey.keys()).some((k) => k.startsWith(`${token}:`))
    if (!hasSeeded) {
      currentMatchIdByToken.delete(token)
    }
  }
  // Enforce max size using insertion order (oldest first)
  while (seededEventsByKey.size > GAME_STATE_CACHE_MAX_SIZE) {
    const oldestKey = seededEventsByKey.keys().next().value as string | undefined
    if (!oldestKey) break
    seededEventsByKey.delete(oldestKey)
  }
}

setInterval(pruneCaches, GAME_STATE_CACHE_CLEANUP_MS)

function markSeeded(key: string, eventName: string) {
  const entry = seededEventsByKey.get(key) ?? { events: new Set<string>(), ts: 0 }
  entry.events.add(eventName)
  entry.ts = Date.now()
  seededEventsByKey.set(key, entry)
}

function hasSeeded(key: string, eventName: string) {
  const entry = seededEventsByKey.get(key)
  return entry?.events.has(eventName) ?? false
}

function getValueForEventName(body: Record<string, any>, eventName: string) {
  const parts = eventName.split(':')
  let cur: any = body
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function emitAll(prefix: string, obj: Record<string, any>, token: string) {
  Object.keys(obj).forEach((key) => {
    const eventName = prefix + key
    events.emit(eventName, obj[key], token)
  })
}

function recursiveEmit(
  prefix: string,
  changed: Record<string, any>,
  body: Record<string, any>,
  token: string,
) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], token)
      }
    } else {
      // Got a key
      if (body[key] != null) {
        if (typeof body[key] === 'object') {
          // Edge case on added:item/ability:x where added shows true at the top level
          // and doesn't contain each of the child keys
          emitAll(`${prefix + key}:`, body[key], token)
        } else {
          const eventName = prefix + key
          events.emit(eventName, body[key], token)
        }
      }
    }
  })
}

export function processChanges(section: string) {
  return function handle(req: Request, res: Response, next: NextFunction) {
    if (req.body[section]) {
      const token = req.body.auth.token as string
      recursiveEmit('', req.body[section], req.body, token)
    }
    next()
  }
}

export function newData(req: Request, res: Response) {
  const token = req.body.auth.token as string
  events.emit('newdata', req.body, token)

  const matchId = req.body.map?.match_id
  if (matchId) {
    const key = `${token}:${matchId}`
    const previousMatchId = currentMatchIdByToken.get(token)
    if (previousMatchId !== matchId) {
      // Prune caches for this token when match_id changes
      for (const [k] of seededEventsByKey.entries()) {
        if (k.startsWith(`${token}:`)) {
          seededEventsByKey.delete(k)
        }
      }
      currentMatchIdByToken.set(token, matchId)
    }

    // Generic initial seeding: ensure listeners receive an initial value even if
    // the current payload didn't include a `previously` or `added` entry.
    // Only seed events once per key to avoid spamming.
    const names = events
      .eventNames()
      .filter((n): n is string => typeof n === 'string' && n !== 'newdata')
    for (const name of names) {
      if (hasSeeded(key, name)) continue
      const val = getValueForEventName(req.body, name)
      if (val === undefined) continue
      if (typeof val === 'object') continue // only seed primitives
      events.emit(name, val, token)
      markSeeded(key, name)
    }
  }

  res.status(200).json({ status: 'ok' })
}
