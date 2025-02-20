import http from 'node:http'
import cors from 'cors'
import express, { json, type Request, type Response, urlencoded } from 'express'
import bodyParserErrorHandler from 'express-body-parser-error-handler'
import { Server, type Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import type { Ability, Item } from '../types.js'
import { logger } from '../utils/logger.js'
import { emitMinimapBlockerStatus } from './GSIHandler.js'
import {
  TOKEN_TIMEOUT,
  checkForInactiveTokens,
  tokenLastPostTimestamps,
} from './clearCacheForUser.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { gsiHandlers } from './lib/consts.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import { validateToken } from './validateToken.js'

function handleSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const { token } = socket.handshake.auth

  getDBUser({ token })
    .then((client) => {
      if (client?.token) {
        // Successful authentication
        next()
      } else {
        socket.emit('auth_error', 'Invalid token') // Send an auth error message if needed
        socket.disconnect(true) // Disconnect the socket and prevent reconnection attempts
      }
    })
    .catch((e) => {
      logger.info('[GSI] Error checking auth', { token, e })
      socket.emit('auth_error', 'Authentication error') // Send an error message if needed
      socket.disconnect(true) // Disconnect the socket and prevent reconnection attempts
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

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://dotabod.com',
  'https://dev.dotabod.com',
  'https://tooltips.dotabod.com',
]
class GSIServer {
  io: Server

  constructor() {
    logger.info('Starting GSI Server!')

    const app = express()
    const httpServer = http.createServer(app)
    this.io = new Server(httpServer, {
      pingTimeout: 60_000,
      cors: {
        origin: allowedOrigins,
      },
    })

    app.use(cors({ origin: allowedOrigins }))
    app.use(json({ limit: '1mb' }))
    app.use(urlencoded({ extended: true, limit: '1mb' }))
    app.use(bodyParserErrorHandler())

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

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('/tooltips/:channelId', async (req: Request, res: Response) => {
      // make sure channel id is a number
      if (!req.params.channelId.match(/^\d+$/)) return res.status(200).json({ status: 'ok' })

      const { channelId } = req.params
      const user = await getDBUser({ twitchId: channelId })
      if (!user?.gsi) return res.status(200).json({ status: 'ok' })

      const dotaClient = user.gsi
      const inv = Object.values(dotaClient?.items ?? {})
      const items: Item[] = inv.slice(0, 9)
      const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient })

      const messageToSend = {
        items: items.map((item) => item.name),
        neutral: dotaClient?.items?.neutral0?.name,
        hero: dotaClient?.hero?.id,
        abilities: dotaClient?.abilities
          ? Object.values(dotaClient?.abilities).map((ability: Ability) => ability.name)
          : [],
        heroes: matchPlayers.map((player) => player.heroid),
      }

      res.status(200).json(messageToSend)
    })

    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    httpServer.listen(5120, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:${5120}`)
    })

    this.io.use(handleSocketAuth)
    this.io.on('connection', handleSocketConnection)
    this.io.on('connect_error', (err) => {
      logger.info('[GSI] io connect_error', { err })
    })
    this.io.on('disconnect', (reason) => {
      logger.info('[GSI] io disconnect', { reason })
    })
    this.io.on('ping', (socket: Socket) => {
      socket.emit('pong')
    })

    // Set up the repeating timer
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setInterval(checkForInactiveTokens, TOKEN_TIMEOUT)
  }

  init() {
    return this
  }
}

export default GSIServer
