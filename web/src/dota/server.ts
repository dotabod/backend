import { EventEmitter } from 'events'
import http from 'http'

import bodyParser from 'body-parser'
import express, { NextFunction, Request, Response } from 'express'
import { Server, Socket } from 'socket.io'

import getDBUser, { invalidTokens } from '../db/getDBUser.js'
import Dota from '../steam/index.js'
import findUser from './lib/connectedStreamers.js'
import { blockCache } from './events.js'

export const events = new EventEmitter()
const pendingCheckAuth = new Set<string>()

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

function processChanges(section: string) {
  return function handle(req: Request, res: Response, next: NextFunction) {
    if (req.body[section]) {
      const token = req.body.auth.token as string
      recursiveEmit('', req.body[section], req.body, token)
    }
    next()
  }
}

function newData(req: Request, res: Response) {
  const token = req.body.auth.token as string
  events.emit(`${token}:newdata`, req.body)
  res.end()
}

function checkAuth(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body.auth.token as string | undefined

  if (invalidTokens.has(token)) {
    res.status(401).send('Invalid token, skipping auth check')
    return
  }

  if (!token) {
    invalidTokens.add(token)
    console.log('[GSI]', `Dropping message from IP: ${req.ip}, no valid auth token`)
    res.status(401).json({
      error: new Error('Invalid request!'),
    })
    return
  }

  if (pendingCheckAuth.has(token)) {
    res.status(401).send('Still validating token, skipping requests until auth')
    return
  }

  pendingCheckAuth.add(token)
  getDBUser(token)
    .then((client) => {
      if (client?.token) {
        client.gsi = req.body
        pendingCheckAuth.delete(token)

        next()
        return
      }

      pendingCheckAuth.delete(token)
      next(new Error('authentication error'))
    })
    .catch((e) => {
      console.log('[GSI]', 'io.use Error checking auth', { token, e })
      invalidTokens.add(token)
      pendingCheckAuth.delete(token)
      next(new Error('authentication error'))
    })
    // TODO: idk if finalyl runs when next() is called in a .then() earlier
    // So adding the .deletes to .then and .catch until i figure that out lol
    .finally(() => {
      pendingCheckAuth.delete(token)
    })
}

class D2GSI {
  app: express.Application
  events: EventEmitter
  io: Server
  httpServer: http.Server
  dota: Dota

  constructor() {
    this.dota = Dota.getInstance()
    const app = express()
    const httpServer = http.createServer(app)
    const io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com'],
        methods: ['GET', 'POST'],
      },
    })

    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true }))

    app.post('/', checkAuth, processChanges('previously'), processChanges('added'), newData)

    // No main page
    app.get('/', (req: Request, res: Response) => {
      res.status(401).json({
        error: new Error('Invalid request!'),
      })
    })

    httpServer.listen(5000, () => {
      console.log('[GSI]', `Dota 2 GSI listening on *:${5000}`)
    })

    // IO auth & client setup so we can send this socket messages
    io.use((socket, next) => {
      const { token } = socket.handshake.auth

      getDBUser(token)
        .then((client) => {
          if (client?.token) {
            next()
            return
          }

          next(new Error('authentication error'))
        })
        .catch((e) => {
          console.log('[GSI]', 'io.use Error checking auth', { token, e })
          next(new Error('authentication error'))
        })
    })

    io.on('connection', (socket: Socket) => {
      const { token } = socket.handshake.auth
      // This triggers a resend of obs blockers
      // TODO: should just send obs blockers regardless of blockcache somehow
      blockCache.delete(token)

      const client = findUser(token)
      if (!client?.token) return

      // Their own personal room
      void socket.join(client.token)
    })

    this.events = events
    this.app = app
    this.httpServer = httpServer
    this.io = io
  }

  init() {
    return this
  }
}

export default D2GSI
