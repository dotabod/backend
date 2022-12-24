import { toUserName } from '@twurple/chat'

import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { getRankDescription } from '../../dota/lib/ranks.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

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
          logger.info('[MMR] Failed to get rank description', e, channel)
        })
      return
    }

    const act = client.SteamAccount.find((a) => a.steam32Id === client.steam32Id)
    if (!act) {
      void chatClient.say(
        channel,
        'Could not find steam account. Try playing a practice bot match first to save your account.',
      )
      return
    }

    getRankDescription(act.mmr, customMmr, act.steam32Id)
      .then((description) => {
        const msg = act.name ? description ?? unknownMsg : ''
        void chatClient.say(channel, msg || unknownMsg)
      })
      .catch((e) => {
        logger.info('[MMR] Failed to get rank description', e, channel)
      })
  },
})
