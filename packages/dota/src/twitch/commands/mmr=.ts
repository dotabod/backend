import { t } from 'i18next'

import { updateMmr } from '../../dota/lib/update-mmr'
import type { UpdateMmrParams } from '../../dota/lib/update-mmr'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

const isNumberValid = (num: string): boolean => {
  const value = Number(num)
  return num.length > 0 && !Number.isNaN(value) && value >= 0 && value <= 20_000
}

const sendMessage = (
  channel: string,
  locale: string,
  key: string,
  messageId: string,
  options = {}
) => {
  chatClient.say(channel, t(key, { lng: locale, ...options }), messageId)
}

const performMmrUpdate = async (params: UpdateMmrParams) => {
  await updateMmr({ ...params, force: true, tellChat: true })
}

const getAccountPromptKey = function getAccountPromptKey(
  steam32Id: number | null,
  multiAccount: number | undefined
): 'updateMmrMulti' | 'multiAccount' | 'unknownSteam' {
  if (steam32Id !== null && steam32Id !== 0) {
    return 'updateMmrMulti'
  }
  if (multiAccount !== undefined && multiAccount !== 0) {
    return 'multiAccount'
  }
  return 'unknownSteam'
}

commandHandler.registerCommand('setmmr', {
  aliases: ['mmr=', 'mmrset'],
  cooldown: 0,
  handler: async (message, args) => {
    const {
      channel: { name: channel, client },
    } = message
    const { locale } = message.channel.client
    const [mmrFromArg, steam32FromArg] = args
    const accounts = client.SteamAccount

    if (!isNumberValid(mmrFromArg)) {
      sendMessage(channel, locale, 'invalidMmr', message.user.messageId)
      return
    }

    if (!steam32FromArg) {
      if (!accounts.length || accounts.length === 1) {
        const steam32Id = accounts.length ? accounts[0].steam32Id : client.steam32Id
        await performMmrUpdate({
          channel,
          currentMmr: client.mmr,
          newMmr: mmrFromArg,
          steam32Id,
          token: client.token,
        })
        return
      }

      const key = getAccountPromptKey(client.steam32Id, client.multiAccount)
      sendMessage(channel, locale, key, message.user.messageId, {
        steamId: Number(client.steam32Id),
        url: 'dotabod.com/dashboard/features',
      })

      if (client.steam32Id !== null && client.steam32Id !== 0) {
        await performMmrUpdate({
          channel,
          currentMmr: client.mmr,
          newMmr: mmrFromArg,
          steam32Id: client.steam32Id,
          token: client.token,
        })
      }
      return
    }

    const accountFromArg = accounts.find((a) => a.steam32Id === Number(steam32FromArg))
    if (Number(steam32FromArg) === 0 || Number.isNaN(Number(steam32FromArg)) || !accountFromArg) {
      const key =
        client.multiAccount !== undefined && client.multiAccount !== 0
          ? 'multiAccount'
          : 'unknownSteam'
      sendMessage(channel, locale, key, message.user.messageId, {
        url: 'dotabod.com/dashboard/features',
      })
      return
    }

    await performMmrUpdate({
      channel,
      currentMmr: accountFromArg.mmr,
      newMmr: mmrFromArg,
      steam32Id: accountFromArg.steam32Id,
      token: client.token,
    })
  },
  onlyOnline: false,
  permission: 2,
})
