import './commands/apm.js'
import './commands/commands.js'
import './commands/dotabod.js'
import './commands/gpm.js'
import './commands/hero.js'
import './commands/mmr.js'
import './commands/mmr=.js'
import './commands/ping.js'
import './commands/refresh.js'
import './commands/steam.js'
import './commands/wl.js'
import './commands/xpm.js'
import './commands/gm.js'
import './commands/lg.js'
import './commands/np.js'
import './commands/smurfs.js'
import './commands/match.js'
import './commands/stats.js'
import './commands/toggle.js'
import './commands/ranked.js'
import './commands/test.js'
import './commands/dotabuff.js'
import './commands/opendota.js'
import './commands/fixparty.js'
import './commands/avg.js'

import { io } from 'socket.io-client'

import getDBUser from '../db/getDBUser.js'
import { DBSettings, getValueOrDefault } from '../db/settings.js'
import { logger } from '../utils/logger.js'
import { modMode } from './commands/modsonly.js'
import { plebMode } from './commands/pleb.js'
import ChatClientSingleton from './lib/ChatClientSingleton.js'
import commandHandler from './lib/CommandHandler.js'

// Setup twitch chat bot client first
export const chatClient = await ChatClientSingleton.getInstance()

// Our docker chat forwarder instance
const socket = io('ws://twitch-chat-listener:5005')

socket.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

socket.on(
  'msg',
  function (channel: string, user: string, text: string, { channelId, userInfo, messageId }: any) {
    if (!channelId) return

    // Letting one pleb in
    if (
      plebMode.has(channelId) &&
      !(userInfo.isMod || userInfo.isBroadcaster || userInfo.isSubscriber)
    ) {
      plebMode.delete(channelId)
      void chatClient.say(channel, '/subscribers')
      void chatClient.say(channel, `${user} EZ Clap`)
      return
    }

    // Don't allow non mods to message
    if (modMode.has(channelId) && !(userInfo.isMod || userInfo.isBroadcaster)) {
      void chatClient.deleteMessage(channel, messageId)
      return
    }

    if (!text.startsWith('!')) return

    // So we can get the users settings cuz some commands are disabled
    // This runs every command, but its cached so no hit on db
    getDBUser(undefined, channelId)
      .then((client) => {
        if (!client || !channelId) {
          void chatClient.say(channel, 'User not found. Try logging out and in of dotabod.com')
          return
        }

        const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)
        const toggleCommand = commandHandler.commands.get('toggle')!
        if (
          isBotDisabled &&
          !toggleCommand.aliases.includes(text.replace('!', '').split(' ')[0]) &&
          text.split(' ')[0] !== '!toggle'
        )
          return

        // Handle the incoming message using the command handler
        commandHandler.handleMessage({
          channel: { name: channel, id: channelId, client, settings: client.settings },
          user: {
            name: user,
            permission: userInfo.isBroadcaster
              ? 3
              : userInfo.isMod
              ? 2
              : userInfo.isSubscriber
              ? 1
              : 0,
          },
          content: text,
        })
      })
      .catch((e) => {
        //
      })
  },
)
