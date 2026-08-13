import { EventEmitter } from 'node:events'
import type { NextFunction, Request, Response } from 'express'
import { gsiHandlers } from './lib/consts'
import { isPlayingMatch } from './lib/isPlayingMatch'

export const events = new EventEmitter()
const multiAccountRecoveryPackets = new WeakSet<object>()
const killListSnapshots = new WeakMap<object, { matchId: string; values: Record<string, number> }>()

// I dont think we need 20, but just in case. Default is 11
events.setMaxListeners(20)

// Snapshot of registered event names + every dotted prefix. Built lazily on
// the first POST so all gsiEventLoader registrations have run. Audit confirms
// listeners are never added or removed after startup, so the cache is permanent.
let known: Set<string> | null = null

function ensureIndex() {
  if (known !== null) return
  known = new Set<string>()
  for (const n of events.eventNames() as string[]) {
    known.add(n)
    let acc = ''
    for (const part of n.split(':')) {
      acc = acc ? `${acc}:${part}` : part
      known.add(acc)
    }
  }
}

function emitAll(prefix: string, obj: Record<string, any>, token: string) {
  Object.keys(obj).forEach((key) => {
    const name = prefix + key
    if (known!.has(name)) events.emit(name, obj[key], token)
  })
}

function projectChangedValues(
  changed: Record<string, any>,
  body: Record<string, any>,
): Record<string, any> {
  return Object.fromEntries(
    Object.keys(changed)
      .filter((key) => body[key] != null)
      .map((key) => [key, body[key]]),
  )
}

function recursiveEmit(
  prefix: string,
  changed: Record<string, any>,
  body: Record<string, any>,
  token: string,
) {
  Object.keys(changed).forEach((key) => {
    const name = prefix + key
    if (!known!.has(name)) return
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        if (events.listenerCount(name) > 0) {
          events.emit(name, projectChangedValues(changed[key], body[key]), token)
        }
        recursiveEmit(`${name}:`, changed[key], body[key], token)
      }
    } else if (body[key] != null) {
      if (typeof body[key] === 'object') {
        // Edge case on added:item/ability:x where added shows true at the top
        // level and doesn't contain each of the child keys
        if (events.listenerCount(name) > 0) events.emit(name, body[key], token)
        emitAll(`${name}:`, body[key], token)
      } else {
        events.emit(name, body[key], token)
      }
    }
  })
}

export function processChanges(section: string) {
  return function handle(req: Request, _res: Response, next: NextFunction) {
    if (req.body[section]) {
      ensureIndex()
      const token = req.body.auth.token as string
      recursiveEmit('', req.body[section], req.body, token)
    }
    next()
  }
}

function getKillListDeltaKeys(body: Record<string, any>): Set<string> {
  const keys = new Set<string>()
  const current = body.player?.kill_list

  for (const section of ['previously', 'added']) {
    const changed = body[section]?.player?.kill_list
    if (changed === true && current && typeof current === 'object') {
      for (const key of Object.keys(current)) keys.add(key)
    } else if (changed && typeof changed === 'object') {
      for (const key of Object.keys(changed)) keys.add(key)
    }
  }

  return keys
}

export function processUnmarkedKillListChanges(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = req.body?.auth?.token as string | undefined
  const handler = token ? gsiHandlers.get(token) : undefined
  const current = req.body?.player?.kill_list

  if (!handler || !isPlayingMatch(req.body) || !current || typeof current !== 'object') {
    next()
    return
  }

  const matchId = String(req.body?.map?.matchid ?? '')
  const previous = killListSnapshots.get(handler)
  const currentValues = Object.fromEntries(
    Object.entries(current).filter((entry): entry is [string, number] => {
      return typeof entry[1] === 'number'
    }),
  )

  killListSnapshots.set(handler, { matchId, values: currentValues })

  if (!previous || previous.matchId !== matchId) {
    next()
    return
  }

  const markedKeys = getKillListDeltaKeys(req.body)
  const unmarkedIncreases = Object.fromEntries(
    Object.entries(currentValues).filter(([key, value]) => {
      return !markedKeys.has(key) && value > (previous.values[key] ?? 0)
    }),
  )

  if (Object.keys(unmarkedIncreases).length > 0) {
    events.emit('player:kill_list', unmarkedIncreases, token)
  }

  next()
}

export async function recoverMultiAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.body?.auth?.token as string | undefined
  const handler = token ? gsiHandlers.get(token) : undefined

  if (handler?.client.multiAccount) {
    await handler.updateSteam32Id()
    multiAccountRecoveryPackets.add(req.body)
  }

  next()
}

export function consumeMultiAccountRecovery(packet: object): boolean {
  const recovered = multiAccountRecoveryPackets.has(packet)
  multiAccountRecoveryPackets.delete(packet)
  return recovered
}

export function newData(req: Request, res: Response) {
  const token = req.body.auth.token as string
  events.emit('newdata', req.body, token)
  res.status(200).json({ status: 'ok' })
}
