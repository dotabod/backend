import './commandLoader.js'

import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
} from '@twurple/eventsub-base'
import { t } from 'i18next'
import { io, io as socketIo } from 'socket.io-client'
import getDBUser from '../db/getDBUser.js'
import { server } from '../dota/index.js'
import findUser, { getTokenFromTwitchId } from '../dota/lib/connectedStreamers.js'
import { plebMode } from '../dota/lib/consts.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { logger } from '../utils/logger.js'
import { chatClient } from './chatClient.js'
import commandHandler from './lib/CommandHandler.js'

export const twitchChat = io(`ws://${process.env.HOST_TWITCH_CHAT}:5005`)

logger.info("Starting 'twitch' package")

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchChat.on('disconnect', (reason, details) => {
  logger.warn('Disconnected from dotabod chat server', { reason, details })
})

const lastMissingUserMessageTimestamps: Record<string, number> = {}

twitchChat.on(
  'msg',
  async (
    channel: string,
    user: string,
    text: string,
    {
      channelId,
      userInfo,
      messageId,
    }: {
      channelId: string
      userInfo: {
        isMod: boolean
        isBroadcaster: boolean
        isSubscriber: boolean
        userId: string
      }
      messageId: string
    },
  ) => {
    if (!channelId) return

    // Letting one pleb in
    if (
      plebMode.has(channelId) &&
      !(userInfo.isMod || userInfo.isBroadcaster || userInfo.isSubscriber)
    ) {
      plebMode.delete(channelId)
      chatClient.say(channel, '/subscribers')
      chatClient.say(
        channel,
        t('pleb', { emote: 'EZ Clap', context: 'off', name: user, lng: 'en' }),
      )
      return
    }

    if (!text.startsWith('!')) return

    // So we can get the users settings cuz some commands are disabled
    // This runs every command, but its cached so no hit on db
    const client = await getDBUser({ twitchId: channelId })
    if (!client) {
      const now = Date.now()
      const lastMessageTime = lastMissingUserMessageTimestamps[channel] || 0
      const RATE_LIMIT_MS = 10000
      const shouldSendMessage = now - lastMessageTime > RATE_LIMIT_MS

      if (shouldSendMessage) {
        chatClient.say(channel, t('missingUser', { lng: 'en' }))
        lastMissingUserMessageTimestamps[channel] = now
      }
      return
    }

    if (lastMissingUserMessageTimestamps[channel]) {
      delete lastMissingUserMessageTimestamps[channel]
    }

    const isBotDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription,
    )
    const toggleCommand = commandHandler.commands.get('toggle')
    if (
      isBotDisabled &&
      !toggleCommand?.aliases?.includes(text.replace('!', '').split(' ')[0]) &&
      text.split(' ')[0] !== '!toggle'
    ) {
      return
    }

    // Handle the incoming message using the command handler
    // to address v7 twurple removing #, but my db having # for command stats
    // add a hashtag to the beginning of the channel name if its not there already
    const channelName = channel.startsWith('#') ? channel : `#${channel}`
    await commandHandler.handleMessage({
      channel: { name: channelName, id: channelId, client, settings: client.settings },
      user: {
        messageId: messageId,
        name: user,
        userId: userInfo.userId,
        permission: userInfo.isBroadcaster ? 3 : userInfo.isMod ? 2 : userInfo.isSubscriber ? 1 : 0,
      },
      content: text,
    })
  },
)

const events = {
  subscribeToChannelPredictionBeginEvents: EventSubChannelPredictionBeginEvent,
  subscribeToChannelPredictionProgressEvents: EventSubChannelPredictionProgressEvent,
  subscribeToChannelPredictionLockEvents: EventSubChannelPredictionLockEvent,
  subscribeToChannelPredictionEndEvents: EventSubChannelPredictionEndEvent,
  subscribeToChannelPollBeginEvents: EventSubChannelPollBeginEvent,
  subscribeToChannelPollProgressEvents: EventSubChannelPollProgressEvent,
  subscribeToChannelPollEndEvents: EventSubChannelPollEndEvent,
}

twitchChat.on('event', (eventName: keyof typeof events, broadcasterId: string, data: any) => {
  // Can start doing something with the events

  const token = getTokenFromTwitchId(broadcasterId)
  if (!token) return

  const client = findUser(token)
  if (!client) return

  const isEnabled = getValueOrDefault(DBSettings.livePolls, client.settings, client.subscription)
  if (!isEnabled) return

  server.io.to(token).emit('channelPollOrBet', data, eventName)
})

export const twitchEvent = socketIo(`ws://${process.env.HOST_TWITCH_EVENTS}:5015`)
twitchEvent.on('connect', () => {
  logger.info('We alive on dotabod twitch events server!')
})
