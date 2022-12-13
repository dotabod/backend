import getDBUser from '../db/getDBUser.js'
import commandHandler from './commands/CommandHandler.js'
import { modMode } from './commands/modsonly.js'
import { plebMode } from './commands/pleb.js'
import { getChatClient } from './lib/getChatClient.js'

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

// Setup twitch chat bot client first
// TODO: Think about whether await is necessary here
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!msg.channelId) return

  async function handler() {
    // const {
    // client: { json: redis
    // } = RedisClient.getInstance()
    // const k = await client.json.get('key', { path: '$.test' })
    // const value = await redis.get('key', { path: '$.test' })
    // console.log(value)
    // console.log(k, 'from handler')
  }

  void handler()

  // Letting one pleb in
  if (
    plebMode.has(msg.channelId) &&
    !(msg.userInfo.isMod || msg.userInfo.isBroadcaster || msg.userInfo.isSubscriber)
  ) {
    plebMode.delete(msg.channelId)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, `${user} EZ Clap`)
    return
  }

  // Don't allow non mods to message
  if (modMode.has(msg.channelId) && !(msg.userInfo.isMod || msg.userInfo.isBroadcaster)) {
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
          permission: msg.userInfo.isBroadcaster
            ? 3
            : msg.userInfo.isMod
            ? 2
            : msg.userInfo.isSubscriber
            ? 1
            : 0,
        },
        content: text,
      })
    })
    .catch((e) => {
      //
    })
})
