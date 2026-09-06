import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'

import RedisClient from '../../db/redis-client'
import { isSpectator } from '../../dota/lib/is-spectator'
import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings, ENABLE_SPECTATE_FRIEND_GAME } from '../../settings'
import { getSteamPlayerSummaries } from '../../steam/player-summaries'
import CustomError from '../../utils/custom-error'
import { is8500Plus } from '../../utils/index'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('geo', {
  aliases: ['country', 'location'],
  dbkey: DBSettings.commandGeo,
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const { locale } = client
    const currentMatchId = client.gsi?.map?.matchid

    if (currentMatchId === undefined || currentMatchId.length === 0) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: locale }),
        message.user.messageId
      )
      return
    }

    try {
      const roster = await new MatchDataService(client).resolveRoster()

      if (!isSpectator(client.gsi) && roster.source !== 'sourcetv') {
        // PRESERVED — gated, not dead. Branches below come back if ENABLE_SPECTATE_FRIEND_GAME is
        // re-enabled with bot-friend management. See memory `keep-spectate-friend-path`.
        if (!ENABLE_SPECTATE_FRIEND_GAME) {
          throw new CustomError(t('matchDataValveDisabled', { emote: 'PoroSad', lng: locale }))
        }

        if (is8500Plus(client)) {
          throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
        }
        const redisClient = RedisClient.getInstance()
        const steamServerId = await redisClient.client.get(
          `${currentMatchId}:${client.token}:steamServerId`
        )

        if (steamServerId === null || steamServerId.length === 0) {
          throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
        }
      }

      const matchPlayers = roster.players

      if (matchPlayers.length === 0) {
        throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
      }

      const accounts = matchPlayers
        .map((p) => p.accountId)
        .filter((id): id is number => id !== null && id > 0)

      const summaries = await getSteamPlayerSummaries(accounts)

      const countriesList = matchPlayers
        .map((p) => {
          const cc = p.accountId === null ? undefined : summaries.get(p.accountId)?.countryCode
          if (cc === null || cc === undefined || cc.length === 0) {
            return '?'
          }
          const emoji = countryCodeEmoji(cc)
          return emoji !== undefined && emoji.length > 0 ? emoji : cc
        })
        .join(' · ')

      chatClient.say(
        channel,
        t('countryPlayerList', {
          countries: countriesList,
          lng: locale,
        }),
        message.user.messageId
      )
    } catch (error) {
      const reply = error instanceof Error ? error.message : t('gameNotFound', { lng: locale })
      chatClient.say(channel, reply, message.user.messageId)
    }
  },
  permission: 2,
})
