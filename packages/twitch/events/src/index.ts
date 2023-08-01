import http from 'http'

import { Account } from '@dotabod/prisma/dist/psql/index'
import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'
import express from 'express'
import { Server as SocketServer } from 'socket.io'

import { handleNewUser } from './handleNewUser.js'
import { SubscribeEvents } from './SubscribeEvents.js'
import BotAPI from './twitch/lib/BotApiSingleton.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'

const socketApp = express()
const webhookApp = express()

const server = http.createServer(socketApp)
export const io = new SocketServer(server)

if (!process.env.EVENTSUB_HOST || !process.env.TWITCH_EVENTSUB_SECRET) {
  throw new Error('Missing EVENTSUB_HOST or TWITCH_EVENTSUB_SECRET')
}

const { EVENTSUB_HOST, TWITCH_EVENTSUB_SECRET } = process.env

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []
const botApi = BotAPI.getInstance()

const listener = new EventSubHttpListener({
  apiClient: botApi,
  legacySecrets: true,
  adapter: new EnvPortAdapter({
    hostName: EVENTSUB_HOST,
  }),
  secret: TWITCH_EVENTSUB_SECRET,
  strictHostCheck: true,
})

console.log('[TWITCHEVENTS] Start the event sub listener')
listener.start()
console.log('[TWITCHEVENTS] Started the event sub listener')

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

io.on('connection', (socket) => {
  console.log('Joining socket')
  try {
    void socket.join(DOTABOD_EVENTS_ROOM)
    console.log('Joined socket DOTABOD_EVENTS_ROOM')
  } catch (e) {
    console.log('could not join socket DOTABOD_EVENTS_ROOM', { e })
    return
  }

  console.log('eventsIOConnected = true')
  eventsIOConnected = true

  socket.on('connect_error', (err) => {
    console.log(`connect_error due to ${err.message}`)
  })

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})

// Load every account id when booting server
getAccountIds()
  .then((accountIds) => {
    console.log('[TWITCHEVENTS] Retrieved accountIds', { length: accountIds.length })

    SubscribeEvents(accountIds, listener)
  })
  .catch((e) => {
    console.log('[TWITCHEVENTS] error getting accountIds', { e })
  })

// set the expressjs host name
webhookApp.post('/', express.json(), express.urlencoded({ extended: true }), (req, res) => {
  // check authorization beaerer token
  if (req.headers.authorization !== process.env.TWITCH_EVENTSUB_SECRET) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized',
    })
  }

  if (req.body.type === 'INSERT' && req.body.table === 'accounts') {
    const user = req.body.record as Account
    if (IS_DEV && !DEV_CHANNELIDS.includes(user.providerAccountId)) return
    if (!IS_DEV && DEV_CHANNELIDS.includes(user.providerAccountId)) return

    handleNewUser(user.providerAccountId, listener)
      .then(() => {
        console.log('[TWITCHEVENTS] done handling new user', {
          providerAccountId: user.providerAccountId,
        })
      })
      .catch((e) => {
        console.log('[TWITCHEVENTS] error on handleNewUser', {
          e,
          providerAccountId: user.providerAccountId,
        })
      })
  }

  res.status(200).json({
    status: 'ok',
  })
})

webhookApp.listen(5011, () => {
  console.log('[TWITCHEVENTS] Webhooks Listening on port 5011')
})

socketApp.listen(5015, () => {
  console.log('[TWITCHEVENTS] Socket Listening on port 5015')
})
