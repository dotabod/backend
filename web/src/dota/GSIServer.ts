import bodyParser from 'body-parser'
import express, { Request, Response } from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import Dota from '../steam/index.js'
import { logger } from '../utils/logger.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { blockCache } from './GSIHandler.js'
import { validateToken } from './validateToken.js'

class GSIServer {
  io: Server
  dota: Dota

  constructor() {
    this.dota = Dota.getInstance()

    const app = express()
    const httpServer = http.createServer(app)
    this.io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com'],
        methods: ['GET', 'POST'],
      },
    })

    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true }))
    this.dota.dota2.on('ready', () => {
      logger.info('[SERVER] Connected to dota game coordinator')
      app.post('/', validateToken, processChanges('previously'), processChanges('added'), newData)
    })

    // No main page
    app.get('/', (req: Request, res: Response) => {
      res.status(401).json({
        status: 'ok',
      })
    })

    httpServer.listen(5000, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:${5000}`)
    })

    // IO auth & client setup so we can send this socket messages
    this.io.use((socket, next) => {
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
          logger.info('[GSI] io.use Error checking auth', { token, e })
          next(new Error('authentication error'))
        })
    })

    this.io.on('connection', (socket: Socket) => {
      const { token } = socket.handshake.auth
      // TODO: should just send obs blockers regardless of blockcache somehow
      // This triggers a resend of obs blockers
      blockCache.delete(token)

      // Their own personal room
      void socket.join(token)
    })
  }

  init() {
    return this
  }
}

export default GSIServer
