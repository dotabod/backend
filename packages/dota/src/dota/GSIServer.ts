import fastifyCors from '@fastify/cors'
import fastify, { FastifyInstance } from 'fastify'
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
  server: FastifyInstance

  constructor() {
    logger.info('Starting GSI Server!')
    this.dota = Dota.getInstance()

    this.server = fastify()
    this.server.register(fastifyCors, {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com'],
    })
    this.server.register(import('fastify-socket.io'), {
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'https://dotabod.com'],
        methods: ['GET', 'POST'],
      },
    })
    this.io = this.server.io
    this.server.register(import('@fastify/formbody'))

    this.dota.dota2.on('ready', () => {
      logger.info('[SERVER] Connected to dota game coordinator')
      this.server.post('/', { preHandler: validateToken }, async (request, reply) => {
        await processChanges('previously')(request, reply)
        await processChanges('added')(request, reply)
        await newData(request, reply)
      })
    })

    // No main page
    this.server.get('/', (request, reply) => {
      reply.status(200).send({ status: 'ok' })
    })

    this.server.listen({ port: 5000 }, (err, address) => {
      if (err) throw err

      logger.info(`[GSI] Dota 2 GSI listening on ${address}`)
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

          logger.info('[GSI] io.use Error checking auth 58', { token, client })
          next(new Error('authentication error 58'))
        })
        .catch((e) => {
          logger.info('[GSI] io.use Error checking auth', { token, e })
          next(new Error('authentication error 62'))
        })
    })

    this.io.on('connection', (socket: Socket) => {
      const { token } = socket.handshake.auth
      // TODO: should just send obs blockers regardless of blockcache somehow
      // This triggers a resend of obs blockers
      if (gsiHandlers.has(token)) {
        const handler = gsiHandlers.get(token)
        if (handler) {
          handler.emitBadgeUpdate()
          handler.emitWLUpdate()
          handler.blockCache = null
        }
      }

      // Their own personal room
      void socket.join(token)
    })
  }

  init() {
    return this
  }
}

export default GSIServer
