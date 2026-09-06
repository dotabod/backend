import { t } from 'i18next'

import { redisClient } from '../../../db/redis-instance'
import { delayedQueue } from '../../lib/delayed-queue'
import getHero from '../../lib/get-hero'
import type { HeroNames } from '../../lib/get-hero'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { say } from '../../say'
import eventHandler from '../event-handler'

eventHandler.registerEvent('player:kill_streak', {
  handler: async (dotaClient, streak: number) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }
    if (!dotaClient.client.stream_online) {
      return
    }

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`
    )) as HeroNames | null
    const heroName =
      getHero(playingHero ?? dotaClient.client.gsi?.hero?.name)?.localized_name ?? 'We'

    const previousStreak = Number(dotaClient.client.gsi?.previously?.player?.kill_streak)
    const lostStreak = previousStreak >= 3 && !streak
    if (lostStreak) {
      if (dotaClient.killstreakTaskId) {
        delayedQueue.removeTask(dotaClient.killstreakTaskId)
        dotaClient.killstreakTaskId = undefined
      }

      say(
        dotaClient.client,
        t('killstreak.lost', {
          count: previousStreak,
          emote: 'BibleThump',
          heroName,
          lng: dotaClient.client.locale,
        }),
        { chattersKey: 'killstreak' }
      )
      return
    }

    if (streak <= 3) {
      return
    }

    if (dotaClient.killstreakTaskId) {
      delayedQueue.removeTask(dotaClient.killstreakTaskId)
    }
    dotaClient.killstreakTaskId = delayedQueue.addTask(15_000, () => {
      say(
        dotaClient.client,
        t('killstreak.won', {
          count: streak,
          emote: 'POGGIES',
          heroName,
          lng: dotaClient.client.locale,
        }),
        { chattersKey: 'killstreak' }
      )
    })
  },
})
