import { updateMmr } from '../../dota/lib/updateMmr.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

export const plebMode = new Set()

commandHandler.registerCommand('setmmr', {
  aliases: ['mmr=', 'mmrset'],
  permission: 2,
  cooldown: 15000,
  onlyOnline: true,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const [mmr, steam32Id] = args

    if (!mmr || !Number(mmr) || Number(mmr) > 20000 || Number(mmr) < 0) {
      void chatClient.say(channel, 'Try !setmmr 1234')
      return
    }

    const accounts = client.SteamAccount
    if (!steam32Id) {
      if (accounts.length === 0) {
        // Sends a `0` steam32id so we can save it to the db,
        // but server will update with steam later when they join a match
        updateMmr(mmr, Number(client.steam32Id), channel, client.token)
        return
      } else if (accounts.length === 1) {
        updateMmr(mmr, accounts[0].steam32Id, channel)
        return
      } else {
        if (!Number(client.steam32Id)) {
          void chatClient.say(
            channel,
            `Did not find a steam account, try playing a practice bot match first.`,
          )
          return
        } else {
          updateMmr(mmr, Number(client.steam32Id), channel)
          return
        }
      }
    } else if (!Number(steam32Id)) {
      void chatClient.say(channel, `Invalid steam32Id specified. Try !setmmr ${mmr} <steamid>`)
      return
    }

    if (!accounts.find((a) => a.steam32Id === Number(steam32Id))) {
      void chatClient.say(
        channel,
        `Could not find that steam account for this channel. Try playing a practice bot match first. Then you can !setmmr ${mmr}`,
      )
      return
    }

    updateMmr(mmr, Number(steam32Id), channel)
    return
  },
})
