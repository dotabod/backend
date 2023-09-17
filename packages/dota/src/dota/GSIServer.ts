import express, { Request, Response } from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import Dota from '../steam/index.js'
import { logger } from '../utils/logger.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { emitMinimapBlockerStatus } from './GSIHandler.js'
import { gsiHandlers, isDev } from './lib/consts.js'
import { validateToken } from './validateToken.js'

function handleSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const { token } = socket.handshake.auth

  getDBUser({ token })
    .then((client) => {
      if (client?.token) {
        next()
      } else {
        socket.disconnect()
        next(new Error(`authentication error ${client ? '58' : '62'}`))
      }
    })
    .catch((e) => {
      logger.info('[GSI] io.use Error checking auth', { token, e })
      socket.disconnect()
      next(new Error('authentication error 62'))
    })
}

async function handleSocketConnection(socket: Socket) {
  const { token } = socket.handshake.auth

  await socket.join(token)

  const handler = gsiHandlers.get(token)
  if (handler && !handler.disabled && handler.client.stream_online) {
    if (handler.client.gsi && handler.client.beta_tester) {
      emitMinimapBlockerStatus(handler.client)
    }
    handler.emitBadgeUpdate()
    handler.emitWLUpdate()
    handler.blockCache = null
  }
}

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

    const setupPostRoute = () => {
      app.post('/', validateToken, processChanges('previously'), processChanges('added'), newData)
    }

    if (isDev) {
      setupPostRoute()
    } else {
      this.dota.dota2.on('ready', () => {
        logger.info('[SERVER] Connected to dota game coordinator')
        setupPostRoute()
      })
    }

    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    httpServer.listen(5120, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:${5120}`)
    })

    this.io.use(handleSocketAuth)
    this.io.on('connection', handleSocketConnection)
  }

  init() {
    // Every 5 seconds log the current memory usage
    setInterval(() => {
      const used = process.memoryUsage()
      for (const key in used) {
        logger.info(`[MEMORY] ${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB`)
      }
    }, 5000)

    return this
  }
}

export default GSIServer
