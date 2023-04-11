import express, { Request, Response } from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import Dota from '../steam/index.js'
import { logger } from '../utils/logger.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { gsiHandlers } from './lib/consts.js'
import { validateToken } from './validateToken.js'

class GSIServer {
  io: Server
  dota: Dota

  constructor() {
    logger.info('Starting GSI Server!')
    this.dota = Dota.getInstance()

    const app = express()
    const httpServer = http.createServer(app)
    this.io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com'],
        methods: ['GET', 'POST'],
      },
    })

    app.use(express.json({ limit: '1mb' }))
    app.use(express.urlencoded({ extended: true, limit: '1mb' }))

    this.dota.dota2.on('ready', () => {
      logger.info('[SERVER] Connected to dota game coordinator')
      app.post('/', validateToken, processChanges('previously'), processChanges('added'), newData)
    })

    // No main page
    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({
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

          // logger.info('[GSI] io.use Error checking auth 58', { token, client })
          socket.disconnect()
          next(new Error('authentication error 58'))
        })
        .catch((e) => {
          logger.info('[GSI] io.use Error checking auth', { token, e })
          socket.disconnect()
          next(new Error('authentication error 62'))
        })
    })

    this.io.on('connection', async (socket: Socket) => {
      const { token } = socket.handshake.auth

      // Their own personal room, join first before emitting updates
      await socket.join(token)

      // TODO: should just send obs blockers regardless of blockcache somehow
      // This triggers a resend of obs blockers
      if (gsiHandlers.has(token)) {
        const handler = gsiHandlers.get(token)
        if (handler) {
          if (handler.client.gsi && handler.client.beta_tester) {
            handler.emitMinimapBlockerStatus()
          }
          handler.emitBadgeUpdate()
          handler.emitWLUpdate()
          handler.blockCache = null
        }
      }
    })
  }

  init() {
    return this
  }
}

export default GSIServer
