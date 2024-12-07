import './commandLoader.js'

import { t } from 'i18next'
import { io } from 'socket.io-client'
import getDBUser from '../db/getDBUser.js'
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
    if (process.env.DOTABOD_ENV !== 'production') {
      logger.info('[TWITCHCHAT] msg', {
        channel,
        user,
        text,
        channelId,
        userInfo,
        messageId,
      })
    }
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
    const client = await getDBUser({ token: undefined, twitchId: channelId })
    if (!client || !channelId) {
      const now = Date.now()
      const lastMessageTime = lastMissingUserMessageTimestamps[channel] || 0
      if (now - lastMessageTime > 10000) {
        chatClient.say(channel, t('missingUser', { lng: 'en' }))
        lastMissingUserMessageTimestamps[channel] = now
      }
      return
    }

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)
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
        name: user,
        userId: userInfo.userId,
        permission: userInfo.isBroadcaster ? 3 : userInfo.isMod ? 2 : userInfo.isSubscriber ? 1 : 0,
      },
      content: text,
    })
  },
)
