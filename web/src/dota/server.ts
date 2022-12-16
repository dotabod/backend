import { EventEmitter } from 'events'
import http from 'http'

import bodyParser from 'body-parser'
import express, { NextFunction, Request, Response } from 'express'
import { Server, Socket } from 'socket.io'

import getDBUser, { invalidTokens } from '../db/getDBUser.js'
import RedisClient from '../db/redis.js'
import Dota from '../steam/index.js'
import { blockCache } from './events.js'
import { GSIClient } from './GSIClient.js'
import findUser from './lib/connectedStreamers.js'
import { gsiClients } from './lib/consts.js'

declare module 'express-serve-static-core' {
  interface Request {
    client: GSIClient
  }
}

const { client: redis } = RedisClient.getInstance()

export const events = new EventEmitter()

const pendingAuthTokens = new Set<string>()
function checkAuth(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token
  if (invalidTokens.has(token) || pendingAuthTokens.has(token)) {
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

  pendingAuthTokens.add(token)

  // Only check redis cache for the token on checkAuth()
  // It will exist if they connect the OBS overlay
  getDBUser(token)
    .then((client) => {
      if (client?.token) {
        pendingAuthTokens.delete(token)
        next()
        return
      }

      res.status(401).send('Invalid token')
    })
    .catch((e) => {
      invalidTokens.add(token)
      console.log('[GSI]', 'checkAuth Error checking auth', { token, e })
      res.status(500).send('Error checking auth')
    })
}

function checkClient(req: Request, res: Response, next: NextFunction) {
  let localUser = gsiClients.find((client) => client.token === req.body.auth.token)
  if (localUser) {
    req.client = localUser
    next()
    return
  }

  console.log('[GSI]', `Adding new userGSI for token:`, req.body.auth.token)
  localUser = new GSIClient(req.body.auth)
  req.client = localUser
  gsiClients.push(localUser)

  events.emit('new-gsi-client', localUser.token)
  next()
}

function emitAll(
  prefix: string,
  obj: Record<string, any>,
  emit: (event: string, data: string) => void,
) {
  Object.keys(obj).forEach((key) => {
    emit(prefix + key, obj[key])
  })
}

function recursiveEmit(
  prefix: string,
  changed: Record<string, any>,
  body: Record<string, any>,
  emit: (event: string, data: string) => void,
) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], emit)
      }
    } else {
      // Got a key
      if (body[key] != null) {
        if (typeof body[key] === 'object') {
          // Edge case on added:item/ability:x where added shows true at the top level
          // and doesn't contain each of the child keys
          emitAll(`${prefix + key}:`, body[key], emit)
        } else {
          emit(prefix + key, body[key])
        }
      }
    }
  })
}

function processChanges(section: string) {
  return function handle(req: Request, res: Response, next: NextFunction) {
    if (req.body[section]) {
      recursiveEmit('', req.body[section], req.body, req.client.emit)
    }
    next()
  }
}

function updateGameState(req: Request, res: Response, next: NextFunction) {
  if (req.body?.auth?.token) {
    void redis.json.set(`users:${req.body.auth.token as string}`, '$.gsi', req.body)
  }
  next()
}

function newData(req: Request, res: Response) {
  req.client.emit('newdata', req.body)
  res.end()
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

    app.post(
      '/',
      checkAuth,
      checkClient,
      updateGameState,
      processChanges('previously'),
      processChanges('added'),
      newData,
    )

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

      console.log('[IO]', 'Looking up user', token)
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

    io.on('connection', async (socket: Socket) => {
      const { token } = socket.handshake.auth

      // This triggers a resend of obs blockers
      blockCache.delete(token)

      const client = await findUser(token)
      if (!client?.token) return

      // Their own personal room xdd
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
