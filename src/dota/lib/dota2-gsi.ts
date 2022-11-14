import http from 'http'
import express, { Request, Response, NextFunction } from 'express'
import bodyParser from 'body-parser'
import { EventEmitter } from 'events'
import { Server } from 'socket.io'
import supabase from '../../db/supabase'
import findUser from '../dotaGSIClients'
import { gsiClients, socketClients } from '../trackingConsts'
import { Dota2 } from 'dotagsi'

export const events = new EventEmitter()

export class GSIClient extends EventEmitter {
  ip: string
  auth: { token: string }
  token: string
  gamestate?: Dota2

  constructor(ip: string, auth: { token: string }) {
    super()

    this.ip = ip
    this.auth = auth
    this.token = auth?.token
  }
}

// TODO: Check. Maybe extending class removes this need
// GSIClient.prototype.__proto__ = EventEmitter.prototype

function checkClient(req: Request, res: Response, next: NextFunction) {
  let localUser = gsiClients.find((client) => client.token === req.body.auth.token)
  if (localUser) {
    // in the event socket connects after gsi
    // calling this will add it to the socket
    // findUser(req.body.auth.token)
    // console.log(`Adding new userGSI for IP: ${req.ip}`)
    req.client = localUser
    req.client.gamestate = req.body

    next()
    return
  }

  localUser = new GSIClient(req.ip, req.body.auth)
  req.client = localUser
  req.client.gamestate = req.body
  gsiClients.push(localUser)

  // TODO: check if this actually sets GSI by ref
  const usr = findUser(localUser?.token)
  if (usr) {
    usr.gsi = localUser
  }

  events.emit('new-gsi-client', localUser)
  next()
}

function emitAll(
  prefix: string,
  obj: { [x: string]: any },
  emitter: { emit: (arg0: string, arg1: any) => void },
) {
  Object.keys(obj).forEach((key) => {
    emitter.emit(prefix + key, obj[key])
  })
}

function recursiveEmit(
  prefix: string,
  changed: { [x: string]: any },
  body: { [x: string]: any },
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

const invalidTokens: any[] = []
async function checkAuth(req: Request, res: Response, next: NextFunction) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token
  if (invalidTokens.includes(token)) {
    res.status(401).send('Invalid token')
    return
  }

  if (!token) {
    console.log(`Dropping message from IP: ${req.ip}, no valid auth token`)
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

  console.log('Havent cached user token yet, checking db', { token })

  const { data: user, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', token)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (!error) {
    // sockets[] to be filled in by socket connection
    socketClients.push({ ...user, token, sockets: [] })
    next()
    return
  }

  invalidTokens.push(token)

  res.status(401).json({
    error: new Error('Invalid auth'),
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

    httpServer.listen(process.env.MAIN_PORT || 3000, () => {
      console.log(`Dota 2 GSI listening on *:${process.env.MAIN_PORT || 3000}`)
    })

    this.events = events
    this.app = app
    this.httpServer = httpServer
    this.io = io
  }
}

export default D2GSI
