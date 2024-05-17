import { t } from 'i18next'

import { updateMmr, type UpdateMmrParams } from '../../dota/lib/updateMmr.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

const isNumberValid = (num: string) => num && Number(num) >= 0 && Number(num) <= 20_000

const sendMessage = (channel: string, locale: string, key: string, options = {}) => {
  chatClient.say(channel, t(key, { lng: locale, ...options }))
}

const performMmrUpdate = async (params: UpdateMmrParams) => {
  return await updateMmr({ ...params, force: true, tellChat: true })
}

commandHandler.registerCommand('setmmr', {
  aliases: ['mmr=', 'mmrset'],
  permission: 2,
  cooldown: 0,
  onlyOnline: false,
  handler: async (message, args) => {
    const {
      channel: { name: channel, client },
    } = message
    const { locale } = message.channel.client
    const [mmrFromArg, steam32FromArg] = args
    const accounts = client.SteamAccount

    if (!isNumberValid(mmrFromArg)) {
      sendMessage(channel, locale, 'invalidMmr')
      return
    }

    if (!steam32FromArg) {
      if (!accounts.length || accounts.length === 1) {
        const steam32Id = accounts.length ? accounts[0].steam32Id : client.steam32Id
        await performMmrUpdate({
          currentMmr: client.mmr,
          newMmr: mmrFromArg,
          steam32Id,
          channel,
          token: client.token,
        })
        return
      }

      const key = !Number(client.steam32Id)
        ? client.multiAccount
          ? 'multiAccount'
          : 'unknownSteam'
        : 'updateMmrMulti'
      sendMessage(channel, locale, key, {
        url: 'dotabod.com/dashboard/features',
        steamId: Number(client.steam32Id),
      })

      if (Number(client.steam32Id)) {
        await performMmrUpdate({
          currentMmr: client.mmr,
          newMmr: mmrFromArg,
          steam32Id: client.steam32Id,
          channel,
          token: client.token,
        })
      }
      return
    }

    const accountFromArg = accounts.find((a) => a.steam32Id === Number(steam32FromArg))
    if (!Number(steam32FromArg) || !accountFromArg) {
      const key = client.multiAccount ? 'multiAccount' : 'unknownSteam'
      sendMessage(channel, locale, key, { url: 'dotabod.com/dashboard/features' })
      return
    }

    await performMmrUpdate({
      currentMmr: accountFromArg.mmr,
      newMmr: mmrFromArg,
      steam32Id: accountFromArg.steam32Id,
      channel,
      token: client.token,
    })
  },
})
