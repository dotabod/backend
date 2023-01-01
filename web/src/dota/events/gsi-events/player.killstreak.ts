import { t } from 'i18next'

import { GSIHandler } from '../../GSIHandler.js'
import getHero from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

let killstreakTimeout: NodeJS.Timeout

eventHandler.registerEvent(`player:kill_streak`, {
  handler: (dotaClient: GSIHandler, streak: number) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const heroName =
      getHero(dotaClient.playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

    const previousStreak = Number(dotaClient.client.gsi?.previously?.player?.kill_streak)
    const lostStreak = previousStreak > 3 && streak <= 3
    if (lostStreak) {
      dotaClient.say(
        t('killstreak.lost', {
          killstreakCount: previousStreak,
          heroName,
          lng: dotaClient.client.locale,
        }),
        { beta: true },
      )
      return
    }

    if (streak <= 3) return

    clearTimeout(killstreakTimeout)
    killstreakTimeout = setTimeout(() => {
      dotaClient.say(
        t('killstreak.won', { killstreakCount: streak, heroName, lng: dotaClient.client.locale }),
        {
          beta: true,
        },
      )
    }, 15000)
  },
})
