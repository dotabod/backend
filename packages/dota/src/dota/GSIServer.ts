import FastifyCors from '@fastify/cors'
import formBody from '@fastify/formbody'
import Fastify, { FastifyInstance } from 'fastify'
import SocketioServer from 'fastify-socket.io'
import { Server, Socket } from 'socket.io'

import getDBUser from '../db/getDBUser.js'
import Dota from '../steam/index.js'
import { logger } from '../utils/logger.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { gsiHandlers } from './lib/consts.js'
import { validateToken } from './validateToken.js'

const origin = ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com']
class GSIServer {
  io: Server
  dota: Dota
  server: FastifyInstance

  constructor() {
    logger.info('Starting GSI Server!')
    this.dota = Dota.getInstance()

    this.server = Fastify()
    this.server.register(formBody)
    this.server.register(FastifyCors, {
      origin: origin,
    })
    this.server.register(SocketioServer, {
      cors: {
        origin: origin,
        methods: ['GET', 'POST'],
      },
    })

    // No main page
    this.server.get('/', (request, reply) => {
      reply.send({ status: 'ok' })
    })

    this.server.post(
      '/',
      {
        preHandler: [validateToken],
        preValidation: [processChanges('previously'), processChanges('added')],
      },
      (request, reply) => {
        newData(request, reply)
      },
    )

    this.server.ready((err) => {
      if (err) throw err
      this.io = this.server.io

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
    })

    this.dota.dota2.on('ready', () => {
      logger.info('[SERVER] Connected to dota game coordinator')
    })

    this.server.listen({ port: 5000, host: '0.0.0.0' }, (err, address: string) => {
      if (err) throw err

      logger.info(`[GSI] Dota 2 GSI listening on ${address}`)
    })
  }

  init() {
    return this
  }
}

export default GSIServer
