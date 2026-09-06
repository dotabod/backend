import type { Json } from '@dotabod/shared-utils'
import type { NextFunction } from 'express'
import { z } from 'zod'

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
const jsonObjectSchema = z.record(z.string(), z.json())
type JsonObject = z.infer<typeof jsonObjectSchema>
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

const parseJsonObject = function parseJsonObject(
  value: AuthenticatedGsiPacket | Json | undefined
): JsonObject | null {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : null
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
    const name = prefix + key
    if (knownEvents.has(name)) {
      events.emit(name, obj[key], token)
    }
  }
}

const projectChangedValues = function projectChangedValues(
  changed: JsonObject,
  body: JsonObject
): JsonObject {
  const projected: JsonObject = {}
  for (const key of Object.keys(changed)) {
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
  const changedObject = parseJsonObject(changedValue)
  const bodyObject = parseJsonObject(bodyValue)
  if (changedObject !== null && bodyObject !== null) {
    if (events.listenerCount(name) > 0) {
      events.emit(name, projectChangedValues(changedObject, bodyObject), context.token)
    }
    return { body: bodyObject, changed: changedObject, prefix: `${name}:` }
  }
  if (bodyValue === null || bodyValue === undefined) {
    return null
  }
  if (bodyObject === null) {
    events.emit(name, bodyValue, context.token)
    return null
  }
  if (events.listenerCount(name) > 0) {
    events.emit(name, bodyObject, context.token)
  }
  emitAll(`${name}:`, bodyObject, context.token, context.knownEvents)
  return null
}

const recursiveEmit = function recursiveEmit(
  prefix: string,
  changed: JsonObject,
  body: JsonObject,
  context: RecursiveEmitContext
) {
  for (const key of Object.keys(changed)) {
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
    const changed = parseJsonObject(req.body[section])
    const body = parseJsonObject(req.body)
    const token = req.body.auth?.token
    if (changed !== null && body !== null && token !== undefined && token.length > 0) {
      recursiveEmit('', changed, body, { knownEvents: ensureIndex(), token })
    }
    next()
  }
}

const getKillListDeltaKeys = function getKillListDeltaKeys(body: AuthenticatedGsiPacket) {
  const keys = new Set<string>()
  const current = body.player?.kill_list

  for (const section of ['previously', 'added'] as const) {
    const sectionValue = parseJsonObject(body[section])
    const changedPlayer = parseJsonObject(sectionValue?.player)
    const changed = changedPlayer?.kill_list
    if (changed === true && current !== undefined) {
      for (const key of Object.keys(current)) {
        keys.add(key)
      }
    } else {
      const changedObject = parseJsonObject(changed)
      for (const key of Object.keys(changedObject ?? {})) {
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
