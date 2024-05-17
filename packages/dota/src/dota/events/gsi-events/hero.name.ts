import { t } from 'i18next'

import supabase from '../../../db/supabase.js'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { openTwitchBet } from '../../../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../../../twitch/lib/refundTwitchBets.js'
import { logger } from '../../../utils/logger.js'
import { type GSIHandler, redisClient } from '../../GSIHandler.js'
import getHero, { type HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent('hero:name', {
  handler: async (dotaClient: GSIHandler, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`,
    )) as HeroNames | null

    if (playingHero && playingHero !== name) {
      const oldBetId = await refundTwitchBet(dotaClient.getChannelId())
      const hero = getHero(name)

      try {
        const bet = await openTwitchBet({
          client: dotaClient.client,
          heroName: hero?.localized_name,
        })
        if (oldBetId && bet.id) {
          await supabase.from('bets').update({ predictionId: bet.id }).eq('predictionId', oldBetId)
        }
      } catch (e) {
        return
      }

      const tellChatBets = getValueOrDefault(DBSettings.tellChatBets, dotaClient.client.settings)
      if (tellChatBets)
        say(
          dotaClient.client,
          t('bets.remade', {
            lng: dotaClient.client.locale,
            emote: 'Okayeg 👍',
            emote2: 'peepoGamble',
            oldHeroName: playingHero
              ? getHero(playingHero)?.localized_name ?? playingHero
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
