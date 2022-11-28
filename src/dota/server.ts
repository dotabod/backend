import { EventEmitter } from 'events'
import http from 'http'

import * as Sentry from '@sentry/node'
import bodyParser from 'body-parser'
import express, { NextFunction, Request, Response } from 'express'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser'
import { GSIClient } from './GSIClient'
import findUser from './lib/connectedStreamers'
import { gsiClients, socketClients } from './lib/consts'

declare module 'express-serve-static-core' {
  interface Request {
    client: GSIClient
  }
}

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

  const usr = findUser(localUser.token)
  if (usr) {
    usr.gsi = localUser
  }

  events.emit('new-gsi-client', localUser)
  next()
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

const invalidTokens: string[] = []
function checkAuth(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token
  if (invalidTokens.includes(token)) {
    res.status(401).send('Invalid token')
    return
  }

  if (!token) {
    console.log('[GSI]', `Dropping message from IP: ${req.ip}, no valid auth token`)
    res.status(401).json({
      error: new Error('Invalid request!'),
    })
    return
  }

  // Our local memory cache of clients to sockets
  const connectedSocketClient = findUser(token)
  if (connectedSocketClient) {
    next()
    return
  }

  console.log('[GSI]', 'Havent cached user token yet, checking db', { token })

  getDBUser(token)
    .then((user) => {
      if (user?.id) {
        // sockets[] to be filled in by socket connection, so will steamid
        socketClients.push({ ...user, token, sockets: [], steam32Id: 0, mmr: 0 })
        next()
        return
      }

      console.log('[GSI]', 'Invalid token', { token })
      invalidTokens.push(token)
      res.status(401).send('Invalid token')
    })
    .catch((e) => {
      console.log('[GSI]', 'Error checking auth', { token, e })
      res.status(500).send('Error checking auth')
    })
}

class D2GSI {
  app: express.Application
  events: EventEmitter
  io: Server
  httpServer: http.Server

  constructor() {
    const app = express()
    const httpServer = http.createServer(app)
    const io = new Server(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'https://dotabod.com',
          'https://dotabod.vercel.app',
          'https://dotabot.vercel.app',
        ],
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
      const connectedSocketClient = findUser(token)

      // Cache to prevent a supabase lookup on every message for username & token validation
      if (connectedSocketClient) {
        connectedSocketClient.sockets.push(socket.id)
        next()
        return
      }

      getDBUser(token)
        .then((user) => {
          if (!user) {
            next(new Error('authentication error'))
            return
          }

          // In case the socket is connected before the GSI client has!
          socketClients.push({
            ...user,
            token,
            sockets: [socket.id],
          })

          next()
        })
        .catch((e) => {
          console.log('[GSI]', 'Error checking auth', { token, e })
          next(new Error('authentication error'))
        })
    })

    // Cleanup the memory cache of sockets when they disconnect
    io.on('connection', (socket: Socket) => {
      const { token } = socket.handshake.auth

      // Socket connected event, used to connect GSI to a socket
      const connectedSocketClient = findUser(token)
      events.emit('new-socket-client', {
        client: connectedSocketClient,
        socketId: socket.id,
      })

      socket.on('disconnect', () => {
        if (connectedSocketClient) {
          connectedSocketClient.sockets = connectedSocketClient.sockets.filter(
            (socketid) => socketid !== socket.id,
          )

          // Let's also remove all the events we setup from the client for this socket
          // That way a new socket will get the GSI events again
          if (!connectedSocketClient.sockets.length) {
            console.log(
              '[GSI]',
              'No more sockets connected, removing all events for',
              connectedSocketClient.token,
            )
            // There's no socket connected so let's remove all GSI events
            connectedSocketClient.gsi?.removeAllListeners()
          }
        }
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
