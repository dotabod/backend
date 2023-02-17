import { t } from 'i18next'

import { updateMmr } from '../../dota/lib/updateMmr.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('setmmr', {
  aliases: ['mmr=', 'mmrset'],
  permission: 2,
  cooldown: 0,
  onlyOnline: true,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const [mmr, steam32Id] = args

    if (!mmr || !Number(mmr) || Number(mmr) > 20000 || Number(mmr) < 0) {
      chatClient.say(channel, t('invalidMmr', { lng: message.channel.client.locale }))
      return
    }

    const accounts = client.SteamAccount
    if (!steam32Id) {
      if (accounts.length === 0) {
        // Sends a `0` steam32Id so we can save it to the db,
        // but server will update with steam later when they join a match
        updateMmr({
          newMmr: mmr,
          steam32Id: Number(client.steam32Id),
          channel: channel,
          token: client.token,
        })
        return
      } else if (accounts.length === 1) {
        updateMmr({ newMmr: mmr, steam32Id: accounts[0].steam32Id, channel: channel })
        return
      } else {
        if (!Number(client.steam32Id)) {
          chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
          return
        } else {
          chatClient.say(
            channel,
            t('updateMmrMulti', {
              steamId: Number(client.steam32Id),
              lng: message.channel.client.locale,
            }),
          )
          updateMmr({ newMmr: mmr, steam32Id: Number(client.steam32Id), channel: channel })
          return
        }
      }
    } else if (!Number(steam32Id)) {
      chatClient.say(channel, t('invalidMmr', { lng: message.channel.client.locale }))
      return
    }

    if (!accounts.find((a) => a.steam32Id === Number(steam32Id))) {
      chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }

    return
  },
})
