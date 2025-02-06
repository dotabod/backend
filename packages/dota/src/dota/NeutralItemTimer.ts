import { t } from 'i18next'
import { say } from './say.js'
import type { GSIHandler } from './GSIHandler.js'
import { redisClient } from './GSIHandler.js'

interface TierTime {
  tier: number
  normalTime: number
  turboTime: number
}

export class NeutralItemTimer {
  private lastCheckedMinute = -1
  private notifiedTiers = new Set<number>()
  private readonly tierTimes: TierTime[] = [
    { tier: 1, normalTime: 7, turboTime: 3.5 },
    { tier: 2, normalTime: 17, turboTime: 8.5 },
    { tier: 3, normalTime: 27, turboTime: 13.5 },
    { tier: 4, normalTime: 37, turboTime: 18.5 },
    { tier: 5, normalTime: 60, turboTime: 30 },
  ]

  constructor(private dotaClient: GSIHandler) {}

  async checkNeutralItems() {
    if (!this.dotaClient.client.gsi?.map?.game_time) return
    if (!this.dotaClient.client.stream_online) return

    // Get the event game time, handle reconnects by using map time if available
    const gameTimeDiff =
      (this.dotaClient.client.gsi?.map?.game_time ?? 0) - this.dotaClient.client.gsi.map.game_time

    const currentMinute = Math.floor(gameTimeDiff / 60)

    // Only check once per minute
    if (currentMinute <= this.lastCheckedMinute) return
    this.lastCheckedMinute = currentMinute

    const matchId = await redisClient.client.get(`${this.dotaClient.client.token}:matchId`)
    const playingGameMode = Number(await redisClient.client.get(`${matchId}:gameMode`))

    // logger.info('[NEUTRAL ITEMS] Checking neutral items timing', {
    //   name: this.dotaClient.client.name,
    //   currentMinute,
    //   gameTimeDiff,
    //   playingGameMode,
    //   matchId,
    // })

    // Check if the game mode is Turbo (23)
    const isTurbo = playingGameMode === 23

    this.tierTimes.forEach((tierTime) => {
      if (this.notifiedTiers.has(tierTime.tier)) return

      const triggerTime = isTurbo ? tierTime.turboTime : tierTime.normalTime
      if (currentMinute >= triggerTime) {
        this.notifyNeutralItem(tierTime.tier)
        this.notifiedTiers.add(tierTime.tier)
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
    this.lastCheckedMinute = -1
    this.notifiedTiers.clear()
  }
}
