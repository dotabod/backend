import getDBUser from '../../db/getDBUser.js'
import { getChatClient } from '../lib/getChatClient.js'
import commandHandler from './CommandHandler.js'
import { modMode } from './modsonly.js'
import { plebMode } from './pleb.js'

import './apm.js'
import './commands.js'
import './dotabod.js'
import './gpm.js'
import './hero.js'
import './mmr.js'
import './mmr=.js'
import './ping.js'
import './refresh.js'
import './steam.js'
import './wl.js'
import './xpm.js'

// Setup twitch chat bot client first
// TODO: Think about whether await is necessary here
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!msg.channelId) return

  // Letting one pleb in
  if (plebMode.has(channel) && !msg.userInfo.isSubscriber) {
    plebMode.delete(channel)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, `${user} EZ Clap`)
    return
  }

  // Don't allow non mods to message
  if (modMode.has(channel) && !(msg.userInfo.isMod || msg.userInfo.isBroadcaster)) {
    void chatClient.deleteMessage(channel, msg)
    return
  }

  if (!text.startsWith('!')) return

  // So we can get the users settings cuz some commands are disabled
  // This runs every command, but its cached so no hit on db
  getDBUser(undefined, msg.channelId)
    .then((client) => {
      if (!client || !msg.channelId) return

      // Handle the incoming message using the command handler
      commandHandler.handleMessage({
        channel: { name: channel, id: msg.channelId, client },
        user: {
          name: user,
          permission: msg.userInfo.isSubscriber
            ? 1
            : msg.userInfo.isMod
            ? 2
            : msg.userInfo.isBroadcaster
            ? 3
            : 0,
        },
        content: text,
      })
    })
    .catch((e) => {
      //
    })
})
