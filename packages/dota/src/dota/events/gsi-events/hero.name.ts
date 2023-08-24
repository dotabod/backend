import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { openTwitchBet } from '../../../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../../../twitch/lib/refundTwitchBets.js'
import { logger } from '../../../utils/logger.js'
import { GSIHandler, redisClient, say } from '../../GSIHandler.js'
import getHero, { HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:name`, {
  handler: async (dotaClient: GSIHandler, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`,
    )) as HeroNames | null

    if (playingHero && playingHero !== name) {
      refundTwitchBet(dotaClient.getChannelId())
        .then(() => {
          const hero = getHero(name)

          openTwitchBet(
            dotaClient.client.locale,
            dotaClient.getChannelId(),
            hero?.localized_name,
            dotaClient.client.settings,
          )
            .then(() => {
              const tellChatBets = getValueOrDefault(
                DBSettings.tellChatBets,
                dotaClient.client.settings,
              )
              const chattersEnabled = getValueOrDefault(
                DBSettings.chatter,
                dotaClient.client.settings,
              )
              if (tellChatBets && chattersEnabled)
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
            })
            .catch((e: any) => {
              logger.error('[BETS] Error opening twitch bet', {
                channel: dotaClient.client.name,
                e: e?.message || e,
              })
            })
        })
        .catch((e) => {
          logger.error('[BETS] Error refunding twitch bet', {
            e: e?.message || e,
          })
        })
    }

    await redisClient.client.set(`${dotaClient.getToken()}:playingHero`, name)
  },
})
