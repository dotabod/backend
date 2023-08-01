import { Account } from '@dotabod/prisma/dist/psql/index'
import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'
import express from 'express'

import { handleNewUser } from './handleNewUser.js'
import { SubscribeEvents } from './SubscribeEvents.js'
import BotAPI from './twitch/lib/BotApiSingleton.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'

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

// Load every account id when booting server
getAccountIds()
  .then((accountIds) => {
    console.log('[TWITCHEVENTS] Retrieved accountIds', { length: accountIds.length })

    SubscribeEvents(accountIds, listener)
  })
  .catch((e) => {
    console.log('[TWITCHEVENTS] error getting accountIds', { e })
  })
