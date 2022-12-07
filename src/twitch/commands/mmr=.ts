import { getSteamByTwitchId } from '../../db/getDBUser.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

export const plebMode = new Set()

commandHandler.registerCommand('mmr=', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client, id: channelId },
    } = message
    const [, mmr, steam32Id] = args

    if (!mmr || !Number(mmr) || Number(mmr) > 20000 || Number(mmr) < 0) {
      void chatClient.say(channel, 'Invalid MMR specified')
      return
    }

    if (!steam32Id) {
      getSteamByTwitchId(channelId)
        .then((res) => {
          const steamAccounts = res?.SteamAccount ?? []

          if (steamAccounts.length === 0) {
            // Sends a `0` steam32id so we can save it to the db,
            // but server will update with steam later when they join a match
            updateMmr(mmr, Number(client.steam32Id), channel, channelId)
          } else if (steamAccounts.length === 1) {
            updateMmr(mmr, steamAccounts[0].steam32Id, channel, channelId)
          } else {
            if (!steam32Id) {
              void chatClient.say(
                channel,
                `Multiple steam accounts linked to channel. Please specify steam32Id. !mmr= ${mmr} id_goes_here`,
              )
            }
          }
        })
        .catch((e) => {
          // Sends a `0` steam32id so we can save it to the `user` db, but update `steamaccount` later when they join a match
          updateMmr(mmr, Number(steam32Id), channel, channelId)
        })
    } else if (!Number(steam32Id)) {
      void chatClient.say(channel, `Invalid steam32Id specified. !mmr= ${mmr} id_goes_here`)
      return
    } else {
      updateMmr(mmr, Number(steam32Id), channel, channelId)
    }

    return
  },
})
