import { t } from 'i18next'

import type { SocketClient } from '../../types.js'
import { redisClient } from "../../db/redisInstance.js"
import { say } from '../say.js'
import { isPlayingMatch } from './isPlayingMatch.js'

const PASSIVE_THRESHOLD_SECONDS = 30 * 1000

// todo: make sure streamer has gold to buy tp?
export async function checkPassiveTp(client: SocketClient) {
  if (!isPlayingMatch(client.gsi)) return
  if (!client.stream_online) return
  if (Number(client.gsi?.map?.clock_time) <= 30) return

  const passiveTpData = ((await redisClient.client.json.get(`${client.token}:passiveTp`)) as {
    firstNoticedPassive: number
    told: number
  } | null) || {
    firstNoticedPassive: 0,
    told: 0,
  }

  const tp = client.gsi?.items?.teleport0
  const hasTp = tp && tp.name !== 'empty'
  const deadge = client.gsi?.hero?.alive === false
  if (hasTp) {
    // they got a tp within 30s so no scolding
    if (passiveTpData.firstNoticedPassive && !passiveTpData.told) {
      return resetPassiveTime(client.token)
    }

    // they got a tp after 30s so tell how long its been
    if (passiveTpData.told) {
      const seconds = Math.round(
        (Date.now() - passiveTpData.told + PASSIVE_THRESHOLD_SECONDS) / 1000,
      )

      if (deadge) {
        say(
          client,
          t('chatters.tpFromDeath', {
            emote: 'Okayeg 👍',
            seconds,
            channel: `@${client.name}`,
            lng: client.locale,
          }),
          { chattersKey: 'noTp' },
        )
        return resetPassiveTime(client.token)
      }

      say(
        client,
        t('chatters.tpFound', {
          emote: 'Okayeg 👍',
          seconds,
          channel: `@${client.name}`,
          lng: client.locale,
        }),
        { chattersKey: 'noTp' },
      )

      return resetPassiveTime(client.token)
    }
  }

  const currentTime = Date.now()
  if (!hasTp && !passiveTpData.told && !passiveTpData.firstNoticedPassive) {
    // Set the time when passive midas was first noticed
    await redisClient.client.json.set(`${client.token}:passiveTp`, '$', {
      ...passiveTpData,
      firstNoticedPassive: currentTime,
    })
    return false
  }
  if (
    !hasTp &&
    currentTime - passiveTpData.firstNoticedPassive > PASSIVE_THRESHOLD_SECONDS &&
    !passiveTpData.told
  ) {
    await redisClient.client.json.set(`${client.token}:passiveTp`, '$', {
      ...passiveTpData,
      told: Date.now(),
    })
    say(
      client,
      t('chatters.noTp', {
        channel: `@${client.name}`,
        lng: client.locale,
        emote: 'HECANT',
      }),
      { chattersKey: 'noTp' },
    )
    return true
  }
}

/**
 * Resets the passive tp data
 * @param token - The token used for Redis operations
 */
async function resetPassiveTime(token: string) {
  // Reset the passive tp data in Redis
  await redisClient.client.json.set(`${token}:passiveTp`, '$', {
    firstNoticedPassive: 0,
    told: 0,
  })
}
