import { t } from 'i18next'

import { redisClient } from '../../../db/redisInstance.js'
import { delayedQueue } from '../../lib/DelayedQueue.js'
import getHero, { type HeroNames } from '../../lib/getHero.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent('player:kill_streak', {
  handler: async (dotaClient, streak: number) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const playingHero = (await redisClient.client.get(
      `${dotaClient.getToken()}:playingHero`,
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
          emote: 'BibleThump',
          count: previousStreak,
          heroName,
          lng: dotaClient.client.locale,
        }),
        { chattersKey: 'killstreak' },
      )
      return
    }

    if (streak <= 3) return

    if (dotaClient.killstreakTaskId) {
      delayedQueue.removeTask(dotaClient.killstreakTaskId)
    }
    dotaClient.killstreakTaskId = delayedQueue.addTask(15000, () => {
      say(
        dotaClient.client,
        t('killstreak.won', {
          emote: 'POGGIES',
          count: streak,
          heroName,
          lng: dotaClient.client.locale,
        }),
        { chattersKey: 'killstreak' },
      )
    })
  },
})
