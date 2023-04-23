import './commandLoader.js'

import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'
import { io } from 'socket.io-client'

import getDBUser from '../db/getDBUser.js'
import { modMode, plebMode } from '../dota/lib/consts.js'
import { logger } from '../utils/logger.js'
import commandHandler from './lib/CommandHandler.js'

logger.info("Starting 'twitch' package")

// Our docker chat forwarder instance
const twitchChat = io('ws://twitch-chat:5005')

export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: (channel: string, text: string) => {
    twitchChat.emit('say', channel, text)
  },
}

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchChat.on(
  'msg',
  async function (
    channel: string,
    user: string,
    text: string,
    { channelId, userInfo, messageId }: any,
  ) {
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
        t('pleb', { emote: 'EZ Clap', context: 'off', name: user, lng: userInfo.locale }),
      )
      return
    }

    // Don't allow non mods to message
    if (modMode.has(channelId) && !userInfo.isMod && !userInfo.isBroadcaster) {
      // TODO: Disabling this feature until we fix the deleteMessage deprecation notice
      // chatClient.deleteMessage(channel, messageId)
      return
    }

    if (!text.startsWith('!')) return

    // So we can get the users settings cuz some commands are disabled
    // This runs every command, but its cached so no hit on db
    const client = await getDBUser(undefined, channelId)
    if (!client || !channelId) {
      chatClient.say(channel, t('missingUser', { lng: userInfo.locale }))
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
    commandHandler.handleMessage({
      channel: { name: channel, id: channelId, client, settings: client.settings },
      user: {
        name: user,
        permission: userInfo.isBroadcaster ? 3 : userInfo.isMod ? 2 : userInfo.isSubscriber ? 1 : 0,
      },
      content: text,
    })
  },
)
