import { t } from 'i18next'

import { redisClient } from '../db/redis-instance'
import { getRedisNumberValue } from '../utils/index'
import type { GSIHandlerType } from './gsi-handler-types'
import { say } from './say'

export interface TierTime {
  tier: number
  /** Minutes until this tier drops in a normal game (updated for patch 7.41) */
  normalTime: number
  /** Minutes until this tier drops in a turbo game (half of normalTime) */
  turboTime: number
}

/**
 * Neutral item tier availability times (Dota 2 patch 7.41).
 * Tier 1 now starts at game start; higher tiers keep their current timings.
 * Turbo times are exactly half of normal times.
 */
export const NEUTRAL_ITEM_TIER_TIMES: TierTime[] = [
  { normalTime: 0, tier: 1, turboTime: 0 },
  { normalTime: 15, tier: 2, turboTime: 7.5 },
  { normalTime: 25, tier: 3, turboTime: 12.5 },
  { normalTime: 35, tier: 4, turboTime: 17.5 },
  { normalTime: 60, tier: 5, turboTime: 30 },
]

export class NeutralItemTimer {
  private readonly notifiedTiers = new Set<number>()
  private readonly tierTimes: TierTime[] = NEUTRAL_ITEM_TIER_TIMES

  // Track the last game time checked to avoid spam
  private lastCheckedTime = 0
  // Buffer time in seconds - how close to check around target times
  private readonly BUFFER_TIME = 3
  // Minimum time between checks in seconds
  private readonly CHECK_INTERVAL = 1

  constructor(private readonly dotaClient: GSIHandlerType) {}

  async checkNeutralItems() {
    const map = this.dotaClient.client.gsi?.map
    const gameTime = map?.game_time
    if (map === undefined || gameTime === undefined || gameTime === 0) {
      return
    }
    if (!this.dotaClient.client.stream_online) {
      return
    }

    const clockTime = map.clock_time

    // Only check every CHECK_INTERVAL seconds
    if (clockTime - this.lastCheckedTime < this.CHECK_INTERVAL) {
      return
    }
    this.lastCheckedTime = clockTime

    const matchId = await redisClient.client.get(`${this.dotaClient.client.token}:matchId`)
    const playingGameMode = await getRedisNumberValue(
      `${matchId}:${this.dotaClient.client.token}:gameMode`
    )
    const isTurbo = playingGameMode === 23

    this.tierTimes.forEach((tierTime) => {
      if (this.notifiedTiers.has(tierTime.tier)) {
        return
      }

      const targetSeconds = (isTurbo ? tierTime.turboTime : tierTime.normalTime) * 60
      const timeDiff = clockTime - targetSeconds

      // Check if we're within BUFFER_TIME seconds after the target time
      if (timeDiff >= 0 && timeDiff <= this.BUFFER_TIME) {
        this.notifyNeutralItem(tierTime.tier)
        this.notifiedTiers.add(tierTime.tier)
      }
    })
  }

  private notifyNeutralItem(tier: number) {
    say(
      this.dotaClient.client,
      t('neutralItems.tierAvailable', {
        lng: this.dotaClient.client.locale,
        tier,
      }),
      {
        chattersKey: 'neutralItems',
      }
    )
  }

  reset() {
    this.lastCheckedTime = -1
    this.notifiedTiers.clear()
  }
}
