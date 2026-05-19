import { EventEmitter } from 'node:events'
import type { NextFunction, Request, Response } from 'express'

export const events = new EventEmitter()

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
        recursiveEmit(`${name}:`, changed[key], body[key], token)
      }
    } else if (body[key] != null) {
      if (typeof body[key] === 'object') {
        // Edge case on added:item/ability:x where added shows true at the top
        // level and doesn't contain each of the child keys
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

export function newData(req: Request, res: Response) {
  const token = req.body.auth.token as string
  events.emit('newdata', req.body, token)
  res.status(200).json({ status: 'ok' })
}
