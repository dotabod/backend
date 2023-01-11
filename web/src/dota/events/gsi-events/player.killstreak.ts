import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { GSIHandler } from '../../GSIHandler.js'
import getHero from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`player:kill_streak`, {
  handler: (dotaClient: GSIHandler, streak: number) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      killstreak: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chattersEnabled || !chatterEnabled) return

    const heroName =
      getHero(dotaClient.playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

    const previousStreak = Number(dotaClient.client.gsi?.previously?.player?.kill_streak)
    const lostStreak = previousStreak >= 3 && !streak
    if (lostStreak) {
      clearTimeout(dotaClient.killstreakTimeout)

      dotaClient.say(
        t('killstreak.lost', {
          killstreakCount: previousStreak,
          heroName,
          lng: dotaClient.client.locale,
        }),
      )
      return
    }

    if (streak <= 3) return

    clearTimeout(dotaClient.killstreakTimeout)
    dotaClient.killstreakTimeout = setTimeout(() => {
      dotaClient.say(
        t('killstreak.won', { killstreakCount: streak, heroName, lng: dotaClient.client.locale }),
      )
    }, 15000)
  },
})
