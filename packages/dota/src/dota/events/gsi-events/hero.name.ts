import { t } from 'i18next'

import RedisClient from '../../../db/RedisClient.js'
import supabase from '../../../db/supabase.js'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { openTwitchBet } from '../../../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../../../twitch/lib/refundTwitchBets.js'
import { logger } from '@dotabod/shared-utils'
import getHero, { type HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

const redisClient = RedisClient.getInstance()

eventHandler.registerEvent('hero:name', {
  handler: async (dotaClient, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const betsEnabled = getValueOrDefault(
      DBSettings.bets,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )
    if (!betsEnabled) return

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`,
    )) as HeroNames | null

    if (playingHero && playingHero !== name) {
      const matchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)

      if (!matchId) {
        logger.error('No matchId found for hero:name event', {
          token: dotaClient.getToken(),
        })
        return
      }

      const { data: betData } = await supabase
        .from('bets')
        .select('predictionId')
        .eq('matchId', matchId)
        .eq('userId', dotaClient.getToken())
        .is('won', null)
        .single()

      if (betData?.predictionId) {
        await refundTwitchBet(dotaClient.getChannelId(), betData.predictionId)
      }

      const hero = getHero(name)

      const bet = await openTwitchBet({
        client: dotaClient.client,
        heroName: hero?.localized_name,
      })
      if (bet?.id && betData?.predictionId) {
        await supabase
          .from('bets')
          .update({
            predictionId: bet.id,
            updated_at: new Date().toISOString(),
          })
          .eq('predictionId', betData.predictionId)
      } else if (betData?.predictionId) {
        await supabase
          .from('bets')
          .update({ predictionId: null, updated_at: new Date().toISOString() })
          .eq('predictionId', betData.predictionId)
      }

      const tellChatBets = getValueOrDefault(
        DBSettings.tellChatBets,
        dotaClient.client.settings,
        dotaClient.client.subscription,
      )
      if (tellChatBets)
        say(
          dotaClient.client,
          t('bets.remade', {
            lng: dotaClient.client.locale,
            emote: 'Okayeg 👍',
            emote2: 'peepoGamble',
            oldHeroName: playingHero
              ? (getHero(playingHero)?.localized_name ?? playingHero)
              : playingHero,
            newHeroName: hero?.localized_name ?? name,
          }),
          { delay: false },
        )
      logger.info('[BETS] remade bets', {
        event: 'open_bets',
        oldHeroName: hero?.localized_name ?? playingHero,
        newHeroName: name,
        user: dotaClient.getToken(),
        player_team: dotaClient.client.gsi?.player?.team_name,
      })
    }

    await redisClient.client.set(`${dotaClient.getToken()}:playingHero`, name)
  },
})
