import { t } from 'i18next'
import { say } from './say.js'
import type { GSIHandler } from './GSIHandler.js'
import { redisClient } from './GSIHandler.js'
import { logger } from '../utils/logger.js'

interface TierTime {
  tier: number
  normalTime: number
  turboTime: number
}

export class NeutralItemTimer {
  private notifiedTiers = new Set<number>()
  //5, 15, 25, 35 and 60 - 7.38 patch
    private readonly tierTimes: TierTime[] = [
    { tier: 1, normalTime: 5, turboTime: 2.5 },
    { tier: 2, normalTime: 15, turboTime: 7.5 },
    { tier: 3, normalTime: 25, turboTime: 12.5 },
    { tier: 4, normalTime: 35, turboTime: 17.5 },
    { tier: 5, normalTime: 60, turboTime: 30 },
  ]
  // leaving old times if valve change again
/**  private readonly tierTimes: TierTime[] = [
    { tier: 1, normalTime: 7, turboTime: 3.5 },
    { tier: 2, normalTime: 17, turboTime: 8.5 },
    { tier: 3, normalTime: 27, turboTime: 13.5 },
    { tier: 4, normalTime: 37, turboTime: 18.5 },
    { tier: 5, normalTime: 60, turboTime: 30 },
  ]
**/

  // Track the last game time checked to avoid spam
  private lastCheckedTime = 0
  // Buffer time in seconds - how close to check around target times
  private readonly BUFFER_TIME = 3
  // Minimum time between checks in seconds
  private readonly CHECK_INTERVAL = 1

  constructor(private dotaClient: GSIHandler) {}

  async checkNeutralItems() {
    if (!this.dotaClient.client.gsi?.map?.game_time) return
    if (!this.dotaClient.client.stream_online) return

    const clockTime = this.dotaClient.client.gsi.map.clock_time || 0

    // Only check every CHECK_INTERVAL seconds
    if (clockTime - this.lastCheckedTime < this.CHECK_INTERVAL) return
    this.lastCheckedTime = clockTime

    const matchId = await redisClient.client.get(`${this.dotaClient.client.token}:matchId`)
    const playingGameMode = Number(await redisClient.client.get(`${matchId}:gameMode`))
    const isTurbo = playingGameMode === 23

    this.tierTimes.forEach((tierTime) => {
      if (this.notifiedTiers.has(tierTime.tier)) return

      const targetSeconds = (isTurbo ? tierTime.turboTime : tierTime.normalTime) * 60
      const timeDiff = clockTime - targetSeconds

      // Check if we're within BUFFER_TIME seconds after the target time
      if (timeDiff >= 0 && timeDiff <= this.BUFFER_TIME) {
        this.notifyNeutralItem(tierTime.tier)
        this.notifiedTiers.add(tierTime.tier)

        logger.info('[NEUTRAL ITEMS] Notifying tier available', {
          name: this.dotaClient.client.name,
          tier: tierTime.tier,
          targetSeconds,
          clockTime,
          timeDiff,
          isTurbo,
          matchId,
        })
      }
    })
  }

  private notifyNeutralItem(tier: number) {
    say(
      this.dotaClient.client,
      t('neutralItems.tierAvailable', {
        tier,
        lng: this.dotaClient.client.locale,
      }),
      {
        chattersKey: 'neutralItems',
      },
    )
  }

  reset() {
    this.lastCheckedTime = -1
    this.notifiedTiers.clear()
  }
}
