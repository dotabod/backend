import { toUserName } from '@twurple/chat'

import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { getRankDescription } from '../../dota/lib/ranks.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

export const plebMode = new Set()

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    // If connected, we can just respond with the cached MMR
    const mmrEnabled = getValueOrDefault(DBSettings.mmrTracker, client.settings)
    if (!mmrEnabled) return

    const customMmr = getValueOrDefault(DBSettings.customMmr, client.settings)

    const unknownMsg = `I don't know ${toUserName(
      channel,
    )}'s MMR yet. Mods have to !setmmr 1234 or set it in dotabod.com/dashboard/features`

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      if (client.mmr === 0) {
        void chatClient.say(channel, unknownMsg)
        return
      }

      getRankDescription(client.mmr, customMmr, client.steam32Id ?? undefined)
        .then((description) => {
          void chatClient.say(channel, description ?? unknownMsg)
        })
        .catch((e) => {
          console.log('[MMR] Failed to get rank description', e, channel)
        })
      return
    }

    const promises: Promise<string | void>[] = []
    client.SteamAccount.forEach((act) => {
      const prom = getRankDescription(act.mmr, customMmr, act.steam32Id)
        .then((description) => {
          let msg = act.name ? description ?? unknownMsg : ''
          if (msg && client.SteamAccount.length > 1 && act.name) msg = `${act.name}: ${msg}`
          return msg
        })
        .catch((e) => {
          console.log('[MMR] Failed to get rank description', e, channel)
        })
      promises.push(prom)
    })

    Promise.all(promises)
      .then((messages) => {
        void chatClient.say(channel, messages.join(' · ') || unknownMsg)
      })
      .catch((e) => {
        //
      })
  },
})
