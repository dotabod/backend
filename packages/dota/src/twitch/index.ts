import './commandLoader.js'

import type { ChatUser } from '@twurple/chat'
import { t } from 'i18next'

import getDBUser from '../db/getDBUser.js'
import { plebMode } from '../dota/lib/consts.js'
import { DBSettings, getValueOrDefault } from '../settings.js'
import { logger } from '../utils/logger.js'
import { chatClient, twitchChat } from './chatClient.js'
import commandHandler from './lib/CommandHandler.js'

logger.info("Starting 'twitch' package")

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

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
      userInfo: ChatUser
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
    const client = await getDBUser({ token: undefined, twitchId: channelId })
    if (!client || !channelId) {
      chatClient.say(channel, t('missingUser', { lng: 'en' }))
      return
    }

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)
    const toggleCommand = commandHandler.commands.get('toggle')!
    if (
      isBotDisabled &&
      !toggleCommand.aliases?.includes(text.replace('!', '').split(' ')[0]) &&
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
