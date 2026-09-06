import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import RedisClient from '../../../db/redis-client'
import { DBSettings, getValueOrDefault } from '../../../settings'
import { openTwitchBet } from '../../../twitch/lib/open-twitch-bet'
import { refundTwitchBet } from '../../../twitch/lib/refund-twitch-bets'
import { getStreamDelay } from '../../get-stream-delay'
import { delayedQueue } from '../../lib/delayed-queue'
import getHero from '../../lib/get-hero'
import type { HeroNames } from '../../lib/get-hero'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { say } from '../../say'
import eventHandler from '../event-handler'

const redisClient = RedisClient.getInstance()

eventHandler.registerEvent('hero:name', {
  handler: async (dotaClient, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }

    const betsEnabled = getValueOrDefault(
      DBSettings.bets,
      dotaClient.client.settings,
      dotaClient.client.subscription
    )
    if (!betsEnabled) {
      return
    }

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`
    )) as HeroNames | null

    if (playingHero !== null && playingHero.length > 0 && playingHero !== name) {
      const matchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)

      if (matchId === null || matchId.length === 0) {
        logger.error('No matchId found for hero:name event', {
          token: dotaClient.getToken(),
        })
        return
      }

      // Check if this is actually the same game - prevents refunding bets when a new game starts
      const gsiMatchId = dotaClient.client.gsi?.map?.matchid
      if (gsiMatchId !== undefined && gsiMatchId.length > 0 && matchId !== gsiMatchId) {
        // This is a new game, not a hero swap within the same game
        // Don't refund/reopen bets - let openBets() handle the new game
        logger.info('[BETS] Ignoring hero change - different match detected', {
          gsiMatchId,
          redisMatchId: matchId,
          token: dotaClient.getToken(),
        })
        return
      }

      const { data: betData } = await supabase
        .from('matches')
        .select('predictionId')
        .eq('matchId', matchId)
        .eq('userId', dotaClient.getToken())
        .is('won', null)
        .single()

      // KEEP IMMEDIATE REFUND - prevents betting on wrong hero
      if (betData?.predictionId !== null && betData?.predictionId !== undefined) {
        await refundTwitchBet(dotaClient.getChannelId(), betData.predictionId)
      }

      const hero = getHero(name)
      const oldHeroName = getHero(playingHero)?.localized_name ?? playingHero
      const newHeroName = hero?.localized_name ?? name

      // DELAY OPENING NEW BET by stream delay
      delayedQueue.addTask(
        getStreamDelay(dotaClient.client.settings, dotaClient.client.subscription),
        async () => {
          // Open new bet after delay
          const bet = await openTwitchBet({
            client: dotaClient.client,
            heroName: hero?.localized_name,
          })

          // Update database with new prediction ID + the swapped hero name.
          // Without `hero_name` here, the matches row keeps the originally-
          // captured hero (from openTheBet) and !unresolved / manual-resolve
          // chat copy would refer to the wrong hero until closeBets/updateMmr
          // overwrites it at match end.
          if (
            bet?.id !== undefined &&
            bet.id.length > 0 &&
            betData?.predictionId !== null &&
            betData?.predictionId !== undefined &&
            betData.predictionId.length > 0
          ) {
            await supabase
              .from('matches')
              .update({
                hero_name: name,
                predictionId: bet.id,
                updated_at: new Date().toISOString(),
              })
              .eq('predictionId', betData.predictionId)
          } else if (
            betData?.predictionId !== null &&
            betData?.predictionId !== undefined &&
            betData.predictionId.length > 0
          ) {
            await supabase
              .from('matches')
              .update({
                hero_name: name,
                predictionId: null,
                updated_at: new Date().toISOString(),
              })
              .eq('predictionId', betData.predictionId)
          }

          // Send chat message with delay (defaults to true)
          const tellChatBets = getValueOrDefault(
            DBSettings.tellChatBets,
            dotaClient.client.settings,
            dotaClient.client.subscription
          )
          if (tellChatBets) {
            say(
              dotaClient.client,
              t('bets.remade', {
                emote: 'Okayeg 👍',
                emote2: 'peepoGamble',
                lng: dotaClient.client.locale,
                newHeroName,
                oldHeroName,
              })
            )
          }

          logger.info('[BETS] remade bets', {
            event: 'open_bets',
            newHeroName,
            oldHeroName,
            player_team: dotaClient.client.gsi?.player?.team_name,
            user: dotaClient.getToken(),
          })
        }
      )
    }

    await redisClient.client.set(`${dotaClient.getToken()}:playingHero`, name)
  },
})
