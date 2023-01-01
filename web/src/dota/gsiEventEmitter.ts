import { EventEmitter } from 'events'
import { NextFunction, Request, Response } from 'express'

export const events = new EventEmitter()
function emitAll(prefix: string, obj: Record<string, any>, token: string) {
  Object.keys(obj).forEach((key) => {
    events.emit(`${token}:${prefix + key}`, obj[key])
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
          events.emit(`${token}:${prefix + key}`, body[key])
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
  events.emit(`${token}:newdata`, req.body)
  res.end()
}
