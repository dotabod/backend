import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings, ENABLE_SPECTATE_FRIEND_GAME } from '../../settings.js'
import CustomError from '../../utils/customError.js'
import { is8500Plus, steamID64toSteamID32, steamID32toSteamID64 } from '../../utils/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'
import { countryCodeEmoji } from 'country-code-emoji'

commandHandler.registerCommand('geo', {
  aliases: ['country', 'location'],
  permission: 2,
  dbkey: DBSettings.commandGeo,

  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    const locale = client.locale
    const currentMatchId = client.gsi?.map?.matchid

    if (!currentMatchId) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: locale }),
        message.user.messageId,
      )
      return
    }

    try {
      if (!isSpectator(client.gsi)) {
        // Feature flag: Valve disabled the spectate friend game proto
        // Show message immediately instead of waiting for timeout
        if (!ENABLE_SPECTATE_FRIEND_GAME) {
          throw new CustomError(t('matchDataValveDisabled', { emote: 'PoroSad', lng: locale }))
        }

        if (is8500Plus(client)) {
          throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
        }
        const redisClient = RedisClient.getInstance()
        const steamServerId = await redisClient.client.get(
          `${currentMatchId}:${client.token}:steamServerId`,
        )

        if (!steamServerId) {
          throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
        }
      }

      const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })

      if (!Array.isArray(matchPlayers) || matchPlayers.length === 0) {
        throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
      }

      const accounts = matchPlayers.map((p) => Number(p.accountid)).filter((id) => id > 0)

      let accountIdToCountry = new Map<number, string>()

      if (accounts.length) {
        const steamids = accounts
          .map((steam32) => steamID32toSteamID64(steam32))
          .filter((id): id is string => Boolean(id))
          .join(',')
        const apiKey = process.env.STEAM_WEB_API

        if (apiKey) {
          const resp = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamids}`,
          )
          if (resp.ok) {
            const data = (await resp.json()) as {
              response?: { players?: Array<{ steamid: string; loccountrycode?: string }> }
            }
            const players = data?.response?.players ?? []
            for (const p of players) {
              if (!p?.steamid) continue
              const acc32 = steamID64toSteamID32(p.steamid)
              if (typeof acc32 === 'number' && Number.isFinite(acc32) && p.loccountrycode) {
                accountIdToCountry.set(acc32, p.loccountrycode.toUpperCase())
              }
            }
          }
        }
      }

      const countriesList = matchPlayers
        .map((p) => {
          const cc = accountIdToCountry.get(Number(p.accountid))
          if (!cc) return '?'
          return countryCodeEmoji(cc) || cc
        })
        .join(' · ')

      chatClient.say(
        channel,
        t('countryPlayerList', {
          lng: locale,
          countries: countriesList,
        }),
        message.user.messageId,
      )
    } catch (e: any) {
      const msg = !e?.message ? t('gameNotFound', { lng: locale }) : e.message
      chatClient.say(channel, msg, message.user.messageId)
    }
  },
})
