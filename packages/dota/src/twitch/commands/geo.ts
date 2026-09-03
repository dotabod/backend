import { countryCodeEmoji } from 'country-code-emoji'
import { t } from 'i18next'
import RedisClient from '../../db/RedisClient'
import { MatchDataService } from '../../dota/lib/matchData'
import { isSpectator } from '../../dota/lib/isSpectator'
import { DBSettings, ENABLE_SPECTATE_FRIEND_GAME } from '../../settings'
import { getSteamPlayerSummaries } from '../../steam/playerSummaries'
import CustomError from '../../utils/customError'
import { is8500Plus } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('geo', {
  aliases: ['country', 'location'],
  permission: 2,
  dbkey: DBSettings.commandGeo,

  handler: async (message: MessageType, _args: string[]) => {
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
          `${currentMatchId}:${client.token}:steamServerId`,
        )

        if (!steamServerId) {
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
          const cc = p.accountId !== null ? summaries.get(p.accountId)?.countryCode : undefined
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
    } catch (e) {
      const msg = !(e as Error)?.message ? t('gameNotFound', { lng: locale }) : (e as Error).message
      chatClient.say(channel, msg, message.user.messageId)
    }
  },
})
