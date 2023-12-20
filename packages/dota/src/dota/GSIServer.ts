import express, { Request, Response } from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import { logger } from '../utils/logger.js'
import {
  checkForInactiveTokens,
  TOKEN_TIMEOUT,
  tokenLastPostTimestamps,
} from './clearCacheForUser.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { emitMinimapBlockerStatus } from './GSIHandler.js'
import { gsiHandlers } from './lib/consts.js'
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

  constructor() {
    logger.info('Starting GSI Server!')

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

    app.post(
      '/',
      (req: Request, res: Response, next: () => void) => {
        const token = req.body?.auth?.token as string | undefined

        if (token) {
          // Update the timestamp for this token
          tokenLastPostTimestamps.set(token, Date.now())
        }

        next()
      },
      validateToken,
      processChanges('previously'),
      processChanges('added'),
      newData,
    )

    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    httpServer.listen(5120, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:${5120}`)
    })

    this.io.use(handleSocketAuth)
    this.io.on('connection', handleSocketConnection)

    // Set up the repeating timer
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setInterval(checkForInactiveTokens, TOKEN_TIMEOUT)
  }

  init() {
    return this
  }
}

export default GSIServer
