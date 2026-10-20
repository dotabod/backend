import type { Json } from '@dotabod/shared-utils'
import type { NextFunction } from 'express'

import type { DotaEvent } from '../types'
import { gsiHandlers } from './lib/consts'
import { isPlayingMatch } from './lib/is-playing-match'
import type { AuthenticatedGsiPacket } from './validate-token'

export type GsiEventData = AuthenticatedGsiPacket | DotaEvent | Json
type GsiEventListener = (data: GsiEventData, token: string) => void
type TargetListener = (event: Event) => void
interface GsiEventDetail {
  data: GsiEventData
  token: string
}

const eventDetails = new WeakMap<Event, GsiEventDetail>()

export class GsiEventBus {
  private readonly target = new EventTarget()
  private readonly listeners = new Map<string, Map<GsiEventListener, TargetListener>>()

  emit(name: string, data: GsiEventData, token: string): boolean {
    const event = new Event(name)
    eventDetails.set(event, { data, token })
    return this.target.dispatchEvent(event)
  }

  eventNames(): string[] {
    return [...this.listeners.keys()]
  }

  listenerCount(name: string): number {
    return this.listeners.get(name)?.size ?? 0
  }

  on(name: string, listener: GsiEventListener): this {
    const registered = this.listeners.get(name) ?? new Map<GsiEventListener, TargetListener>()
    const eventListener = (event: Event) => {
      const detail = eventDetails.get(event)
      if (detail !== undefined) {
        listener(detail.data, detail.token)
      }
    }
    registered.set(listener, eventListener)
    this.listeners.set(name, registered)
    this.target.addEventListener(name, eventListener)
    return this
  }

  rawListeners(name: string): GsiEventListener[] {
    return [...(this.listeners.get(name)?.keys() ?? [])]
  }

  removeAllListeners(): this {
    for (const [name, registered] of this.listeners) {
      for (const eventListener of registered.values()) {
        this.target.removeEventListener(name, eventListener)
      }
    }
    this.listeners.clear()
    return this
  }
}

export const events = new GsiEventBus()
const multiAccountRecoveryPackets = new WeakSet<AuthenticatedGsiPacket>()
const killListSnapshots = new WeakMap<object, { matchId: string; values: Record<string, number> }>()
type JsonObject = Extract<Json, Record<string, Json | undefined>>
type GsiChangeSection = 'added' | 'previously'

export interface GsiEventRequest {
  body: AuthenticatedGsiPacket
}

export interface GsiEventResponse {
  json: (body: { status: string }) => GsiEventResponse
  status: (code: number) => GsiEventResponse
}

// Snapshot of registered event names + every dotted prefix. Built lazily on
// the first POST so all gsiEventLoader registrations have run. Audit confirms
// listeners are never added or removed after startup, so the cache is permanent.
let known: Set<string> | null = null

const isJsonObject = function isJsonObject(
  value: AuthenticatedGsiPacket | Json | undefined
): value is JsonObject {
  // Runs several times per key per admitted packet, so prefer a typeof check over
  // `instanceof Object`: no prototype-chain walk, and it stays correct if the body ever
  // arrives from a parser that builds null-prototype objects to blunt prototype pollution.
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const asJsonObject = function asJsonObject(
  value: AuthenticatedGsiPacket | Json | undefined
): JsonObject | null {
  return isJsonObject(value) ? value : null
}

interface JsonCloner {
  cloneJsonObject: (value: JsonObject) => JsonObject
  cloneJsonValue: (value: Json) => Json
}

const jsonCloner: JsonCloner = {
  cloneJsonObject(value) {
    const cloned: JsonObject = {}
    for (const key of Object.keys(value)) {
      if (key === '__proto__') {
        continue
      }
      const child = value[key]
      if (child !== undefined) {
        cloned[key] = jsonCloner.cloneJsonValue(child)
      }
    }
    return cloned
  },
  cloneJsonValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => jsonCloner.cloneJsonValue(entry))
    }

    const objectValue = asJsonObject(value)
    return objectValue === null ? value : jsonCloner.cloneJsonObject(objectValue)
  },
}

const ensureIndex = function ensureIndex(): Set<string> {
  if (known === null) {
    known = new Set<string>()
    for (const eventName of events.eventNames()) {
      const name = eventName
      known.add(name)
      let acc = ''
      for (const part of name.split(':')) {
        acc = acc.length > 0 ? `${acc}:${part}` : part
        known.add(acc)
      }
    }
  }
  return known
}

const emitAll = function emitAll(
  prefix: string,
  obj: JsonObject,
  token: string,
  knownEvents: ReadonlySet<string>
) {
  for (const key of Object.keys(obj)) {
    if (key === '__proto__') {
      continue
    }
    const name = prefix + key
    const value = obj[key]
    if (knownEvents.has(name) && value !== undefined) {
      events.emit(name, value, token)
    }
  }
}

const projectChangedValues = function projectChangedValues(
  changed: JsonObject,
  body: JsonObject
): JsonObject {
  const projected: JsonObject = {}
  for (const key of Object.keys(changed)) {
    if (key === '__proto__') {
      continue
    }
    const value = body[key]
    if (value !== null && value !== undefined) {
      projected[key] = value
    }
  }
  return projected
}

interface RecursiveEmitContext {
  knownEvents: ReadonlySet<string>
  token: string
}

interface NestedChange {
  body: JsonObject
  changed: JsonObject
  prefix: string
}

const emitChangedEntry = function emitChangedEntry(
  name: string,
  changedValue: Json | undefined,
  bodyValue: Json | undefined,
  context: RecursiveEmitContext
): NestedChange | null {
  const changedObject = asJsonObject(changedValue)
  const bodyObject = asJsonObject(bodyValue)
  if (changedObject !== null && bodyObject !== null) {
    const hasExactListener = events.listenerCount(name) > 0
    const dispatchBody = hasExactListener ? jsonCloner.cloneJsonObject(bodyObject) : bodyObject
    if (hasExactListener) {
      events.emit(name, projectChangedValues(changedObject, dispatchBody), context.token)
    }
    return { body: dispatchBody, changed: changedObject, prefix: `${name}:` }
  }
  if (bodyValue === null || bodyValue === undefined) {
    return null
  }
  if (bodyObject === null) {
    events.emit(name, jsonCloner.cloneJsonValue(bodyValue), context.token)
    return null
  }
  const dispatchBody = jsonCloner.cloneJsonObject(bodyObject)
  if (events.listenerCount(name) > 0) {
    events.emit(name, dispatchBody, context.token)
  }
  emitAll(`${name}:`, dispatchBody, context.token, context.knownEvents)
  return null
}

const recursiveEmit = function recursiveEmit(
  prefix: string,
  changed: JsonObject,
  body: JsonObject,
  context: RecursiveEmitContext
) {
  for (const key of Object.keys(changed)) {
    if (key === '__proto__') {
      continue
    }
    const name = prefix + key
    if (context.knownEvents.has(name)) {
      const nestedChange = emitChangedEntry(name, changed[key], body[key], context)
      if (nestedChange !== null) {
        recursiveEmit(nestedChange.prefix, nestedChange.changed, nestedChange.body, context)
      }
    }
  }
}

export const processChanges = function processChanges(section: GsiChangeSection) {
  return function handle(req: GsiEventRequest, _res: GsiEventResponse, next: NextFunction) {
    const changed = asJsonObject(req.body[section])
    const body = asJsonObject(req.body)
    const token = req.body.auth?.token
    if (changed !== null && body !== null && token !== undefined && token.length > 0) {
      recursiveEmit('', changed, body, { knownEvents: ensureIndex(), token })
    }
    next()
  }
}

interface RebuiltChanges {
  added: JsonObject
  previously: JsonObject
}

// Dota's own throttle and heartbeat keep packets seconds apart. A baseline older than this
// is from another session (stream offline, game closed), not from a dropped POST.
const MAX_BASELINE_AGE_MS = 60_000
const PACKET_META_KEYS: ReadonlySet<string> = new Set(['added', 'auth', 'previously', 'provider'])
const NO_KEYS: ReadonlySet<string> = new Set()
const lastProcessedPackets = new WeakMap<object, { at: number; body: AuthenticatedGsiPacket }>()

const hasKeys = (value: JsonObject) => Object.keys(value).length > 0

const markAdded = function markAdded(value: Json): Json {
  const object = asJsonObject(value)
  if (object === null) {
    return true
  }
  const marked: JsonObject = {}
  for (const key of Object.keys(object)) {
    const child = object[key]
    if (key !== '__proto__' && child !== undefined) {
      marked[key] = markAdded(child)
    }
  }
  return marked
}

const sameLeaf = (was: Json, now: Json) =>
  was === now ||
  (Array.isArray(was) && Array.isArray(now) && JSON.stringify(was) === JSON.stringify(now))

interface ChangeRebuilder {
  rebuild: (before: JsonObject, after: JsonObject, skip: ReadonlySet<string>) => RebuiltChanges
  record: (changes: RebuiltChanges, key: string, was: Json | undefined, now: Json) => void
}

const changeRebuilder: ChangeRebuilder = {
  rebuild(before, after, skip) {
    const changes: RebuiltChanges = { added: {}, previously: {} }
    const tracked = (key: string) => key !== '__proto__' && !skip.has(key)
    for (const key of Object.keys(after).filter(tracked)) {
      const now = after[key]
      if (now !== undefined) {
        changeRebuilder.record(changes, key, before[key], now)
      }
    }
    for (const key of Object.keys(before).filter(tracked)) {
      const was = before[key]
      if (was !== undefined && after[key] === undefined) {
        changes.previously[key] = asJsonObject(was) === null ? was : true
      }
    }
    return changes
  },
  record(changes, key, was, now) {
    if (was === undefined) {
      changes.added[key] = markAdded(now)
      return
    }
    const nowObject = asJsonObject(now)
    const wasObject = asJsonObject(was)
    if (nowObject === null || wasObject === null) {
      if (!sameLeaf(was, now)) {
        changes.previously[key] = was
      }
      return
    }
    const nested = changeRebuilder.rebuild(wasObject, nowObject, NO_KEYS)
    if (hasKeys(nested.previously)) {
      changes.previously[key] = nested.previously
    }
    if (hasKeys(nested.added)) {
      changes.added[key] = nested.added
    }
  },
}

// Builds the `previously`/`added` sections Dota would have sent for the step from `before`
// to `after`: old values of changed leaves, `true` for a removed object, and `true` at every
// leaf of anything new.
export const rebuildChanges = function rebuildChanges(
  before: JsonObject,
  after: JsonObject,
  skip: ReadonlySet<string> = NO_KEYS
): RebuiltChanges {
  return changeRebuilder.rebuild(before, after, skip)
}

// After a POST times out, Dota sends the next packet as full state with no `previously` or
// `added`, so every transition in it (game end, game state, hero) would never be emitted.
// Rebuild those sections from the last packet this handler processed.
export const fillMissingChanges = function fillMissingChanges(
  req: GsiEventRequest,
  _res: GsiEventResponse,
  next: NextFunction
): void {
  const token = req.body.auth?.token
  const handler = token === undefined || token.length === 0 ? undefined : gsiHandlers.get(token)
  if (handler === undefined) {
    next()
    return
  }

  const now = Date.now()
  const baseline = lastProcessedPackets.get(handler)
  lastProcessedPackets.set(handler, { at: now, body: req.body })

  const hasDotaChanges = req.body.previously !== undefined || req.body.added !== undefined
  const recent = baseline !== undefined && now - baseline.at <= MAX_BASELINE_AGE_MS
  const before = recent ? asJsonObject(baseline.body) : null
  const after = asJsonObject(req.body)
  if (!hasDotaChanges && before !== null && after !== null) {
    const { added, previously } = rebuildChanges(before, after, PACKET_META_KEYS)
    Object.assign(
      req.body,
      hasKeys(previously) ? { previously } : {},
      hasKeys(added) ? { added } : {}
    )
  }
  next()
}

const getKillListDeltaKeys = function getKillListDeltaKeys(body: AuthenticatedGsiPacket) {
  const keys = new Set<string>()
  const current = body.player?.kill_list

  for (const section of ['previously', 'added'] as const) {
    const sectionValue = asJsonObject(body[section])
    const changedPlayer = asJsonObject(sectionValue?.player)
    const changed = changedPlayer?.kill_list
    if (changed === true && current !== undefined) {
      for (const key of Object.keys(current)) {
        if (key === '__proto__') {
          continue
        }
        keys.add(key)
      }
    } else {
      const changedObject = asJsonObject(changed)
      for (const key of Object.keys(changedObject ?? {})) {
        if (key === '__proto__') {
          continue
        }
        keys.add(key)
      }
    }
  }

  return keys
}

export const processUnmarkedKillListChanges = function processUnmarkedKillListChanges(
  req: GsiEventRequest,
  _res: GsiEventResponse,
  next: NextFunction
): void {
  const token = req.body.auth?.token
  if (token === undefined || token.length === 0) {
    next()
    return
  }
  const handler = gsiHandlers.get(token)
  const current = req.body.player?.kill_list

  if (!handler || !isPlayingMatch(req.body) || current === null || current === undefined) {
    next()
    return
  }

  const matchId = req.body.map?.matchid ?? ''
  const previous = killListSnapshots.get(handler)
  const currentValues = Object.fromEntries(
    Object.entries(current).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  )

  killListSnapshots.set(handler, { matchId, values: currentValues })

  if (!previous || previous.matchId !== matchId) {
    next()
    return
  }

  const markedKeys = getKillListDeltaKeys(req.body)
  const unmarkedIncreases = Object.fromEntries(
    Object.entries(currentValues).filter(
      ([key, value]) => !markedKeys.has(key) && value > (previous.values[key] ?? 0)
    )
  )

  if (Object.keys(unmarkedIncreases).length > 0) {
    events.emit('player:kill_list', unmarkedIncreases, token)
  }

  next()
}

export const recoverMultiAccount = async function recoverMultiAccount(
  req: GsiEventRequest,
  _res: GsiEventResponse,
  next: NextFunction
): Promise<void> {
  const token = req.body.auth?.token
  const handler = token !== undefined && token.length > 0 ? gsiHandlers.get(token) : undefined

  if (
    handler !== undefined &&
    handler.client.multiAccount !== undefined &&
    handler.client.multiAccount !== 0
  ) {
    await handler.updateSteam32Id()
    multiAccountRecoveryPackets.add(req.body)
  }

  next()
}

export const consumeMultiAccountRecovery = function consumeMultiAccountRecovery(
  packet: AuthenticatedGsiPacket
): boolean {
  const recovered = multiAccountRecoveryPackets.has(packet)
  multiAccountRecoveryPackets.delete(packet)
  return recovered
}

export const newData = function newData(req: GsiEventRequest, res: GsiEventResponse) {
  const token = req.body.auth?.token
  if (token !== undefined && token.length > 0) {
    events.emit('newdata', req.body, token)
  }
  res.status(200).json({ status: 'ok' })
}
