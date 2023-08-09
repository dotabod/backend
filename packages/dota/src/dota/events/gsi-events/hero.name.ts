import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { openTwitchBet } from '../../../twitch/lib/openTwitchBet.js'
import { refundTwitchBet } from '../../../twitch/lib/refundTwitchBets.js'
import { logger } from '../../../utils/logger.js'
import { GSIHandler } from '../../GSIHandler.js'
import getHero, { HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`hero:name`, {
  handler: (dotaClient: GSIHandler, name: HeroNames) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    if (dotaClient.playingHero && dotaClient.playingHero !== name) {
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
                dotaClient.say(
                  t('bets.remade', {
                    lng: dotaClient.client.locale,
                    emote: 'Okayeg 👍',
                    emote2: 'peepoGamble',
                    oldHeroName: dotaClient.playingHero
                      ? getHero(dotaClient.playingHero)?.localized_name ?? dotaClient.playingHero
                      : dotaClient.playingHero,
                    newHeroName: hero?.localized_name ?? name,
                  }),
                  { delay: false },
                )
              logger.info('[BETS] remade bets', {
                event: 'open_bets',
                oldHeroName: hero?.localized_name ?? dotaClient.playingHero,
                newHeroName: name,
                user: dotaClient.getToken(),
                player_team: dotaClient.client.gsi?.player?.team_name,
              })
            })
            .catch((e: any) => {
              logger.error('[BETS] Error opening twitch bet', {
                channel: dotaClient.getChannel(),
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

    dotaClient.playingHero = name
  },
})
