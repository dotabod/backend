import { EventEmitter } from 'events'
import http from 'http'

import * as Sentry from '@sentry/node'
import bodyParser from 'body-parser'
import express, { NextFunction, Request, Response } from 'express'
import { Server, Socket } from 'socket.io'

import getDBUser, { invalidTokens } from '../db/getDBUser.js'
import RedisClient from '../db/redis.js'
import Dota from '../steam/index.js'
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

function checkClient(req: Request, res: Response, next: NextFunction) {
  let localUser = gsiClients.find((client) => client.token === req.body.auth.token)
  if (localUser) {
    // in the event socket connects after gsi
    // calling this will add it to the socket
    // findUser(req.body.auth.token)
    // console.log('[GSI]',`Adding new userGSI for IP: ${req.ip}`)
    req.client = localUser
    req.client.gamestate = req.body

    next()
    return
  }

  localUser = new GSIClient(req.ip, req.body.auth)
  req.client = localUser
  req.client.gamestate = req.body
  gsiClients.push(localUser)

  async function handler() {
    const client = await findUser(localUser?.token)
    if (client) {
      await redis.json.set(`users:${client?.token}`, '$.gsi', JSON.stringify(localUser) || {})
    }

    events.emit('new-gsi-client', localUser?.token)
    next()
  }

  void handler()
}

function emitAll(
  prefix: string,
  obj: Record<string, any>,
  emitter: { emit: (arg0: string, arg1: any) => void },
) {
  Object.keys(obj).forEach((key) => {
    emitter.emit(prefix + key, obj[key])
  })
}

function recursiveEmit(
  prefix: string,
  changed: Record<string, any>,
  body: Record<string, any>,
  emitter: { emit: (arg0: string, arg1: any) => void },
) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], emitter)
      }
    } else {
      // Got a key
      if (body[key] != null) {
        if (typeof body[key] === 'object') {
          // Edge case on added:item/ability:x where added shows true at the top level
          // and doesn't contain each of the child keys
          emitAll(`${prefix + key}:`, body[key], emitter)
        } else {
          emitter.emit(prefix + key, body[key])
        }
      }
    }
  })
}

function processChanges(section: string) {
  return function handle(req: Request, res: Response, next: NextFunction) {
    if (req.body[section]) {
      recursiveEmit('', req.body[section], req.body, req.client)
    }
    next()
  }
}

function updateGameState(req: Request, res: Response, next: NextFunction) {
  req.client.gamestate = req.body
  next()
}

function newData(req: Request, res: Response) {
  req.client.emit('newdata', req.body)
  res.end()
}

function checkAuth(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token
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

  getDBUser(token)
    .then((user) => {
      if (user?.token) {
        next()
        return
      }

      res.status(401).send('Invalid token')
    })
    .catch((e) => {
      console.log('[GSI]', 'checkAuth Error checking auth', { token, e })
      res.status(500).send('Error checking auth')
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

    // The request handler must be the first middleware on the app
    app.use(Sentry.Handlers.requestHandler())

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

    app.get('/debug-sentry', function mainHandler(req, res) {
      throw new Error('My first Sentry error!')
    })

    // The error handler must be before any other error middleware and after all controllers
    app.use(Sentry.Handlers.errorHandler())

    httpServer.listen(process.env.MAIN_PORT ?? 3000, () => {
      console.log('[GSI]', `Dota 2 GSI listening on *:${process.env.MAIN_PORT ?? 3000}`)
    })

    // IO auth & client setup so we can send this socket messages
    io.use((socket, next) => {
      const { token } = socket.handshake.auth

      getDBUser(token)
        .then(async (client) => {
          if (client?.token) {
            await redis.json.arrAppend(`users:${client.token}`, '$.sockets', socket.id)
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

    // Cleanup the memory cache of sockets when they disconnect
    io.on('connection', (socket: Socket) => {
      const { token } = socket.handshake.auth

      async function handler() {
        const client = await findUser(token)

        // Socket connected event, used to connect GSI to a socket
        // TODO: dont emit full client, just emit token and find client with redis later
        events.emit('new-socket-client', {
          token: client?.token,
          socketId: socket.id,
        })
      }

      void handler()

      socket.on('disconnect', () => {
        console.log('Disconnecting user', socket.id)
        async function handler() {
          const client = await findUser(token)
          if (client) {
            console.log({ sockets: client.sockets })
            const newSockets = client.sockets.filter((socketid) => socketid !== socket.id)
            console.log({ newSockets })

            await redis.json.set(`users:${client.token}`, '$.sockets', newSockets)

            // Let's also remove all the events we setup from the client for this socket
            // That way a new socket will get the GSI events again
            if (!newSockets.length) {
              console.log(
                '[GSI]',
                'No more sockets connected, removing all events for',
                client.name,
              )
              // There's no socket connected so let's remove all GSI events
              client.gsi?.removeAllListeners()
            }
          }
        }

        void handler()
      })
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
