import { t } from 'i18next'

import { redisClient } from '../../db/redis-instance'
import type { SocketClient } from '../../types'
import { say } from '../say'
import { isPlayingMatch } from './is-playing-match'

const PASSIVE_THRESHOLD_SECONDS = 30 * 1000

interface PassiveTpData {
  firstNoticedPassive: number
  told: number
}

// todo: make sure streamer has gold to buy tp?
export const checkPassiveTp = async function checkPassiveTp(client: SocketClient) {
  if (!isPlayingMatch(client.gsi)) {
    return
  }
  if (!client.stream_online) {
    return
  }
  if (Number(client.gsi?.map?.clock_time) <= 30) {
    return
  }

  const passiveTpData = (await redisClient.getJson<PassiveTpData>(`${client.token}:passiveTp`)) ?? {
    firstNoticedPassive: 0,
    told: 0,
  }

  const tp = client.gsi?.items?.teleport0
  const hasTp = tp !== undefined && tp.name !== 'empty'
  const deadge = client.gsi?.hero?.alive === false
  if (hasTp) {
    // they got a tp within 30s so no scolding
    if (passiveTpData.firstNoticedPassive !== 0 && passiveTpData.told === 0) {
      await resetPassiveTime(client.token)
      return
    }

    // they got a tp after 30s so tell how long its been
    if (passiveTpData.told !== 0) {
      const seconds = Math.round(
        (Date.now() - passiveTpData.told + PASSIVE_THRESHOLD_SECONDS) / 1000
      )

      if (deadge) {
        say(
          client,
          t('chatters.tpFromDeath', {
            channel: `@${client.name}`,
            emote: 'Okayeg 👍',
            lng: client.locale,
            seconds,
          }),
          { chattersKey: 'noTp' }
        )
        await resetPassiveTime(client.token)
        return
      }

      say(
        client,
        t('chatters.tpFound', {
          channel: `@${client.name}`,
          emote: 'Okayeg 👍',
          lng: client.locale,
          seconds,
        }),
        { chattersKey: 'noTp' }
      )

      await resetPassiveTime(client.token)
      return
    }
  }

  const currentTime = Date.now()
  if (!hasTp && passiveTpData.told === 0 && passiveTpData.firstNoticedPassive === 0) {
    // Set the time when passive midas was first noticed
    await redisClient.setJson(`${client.token}:passiveTp`, {
      ...passiveTpData,
      firstNoticedPassive: currentTime,
    })
    return false
  }
  if (
    !hasTp &&
    currentTime - passiveTpData.firstNoticedPassive > PASSIVE_THRESHOLD_SECONDS &&
    passiveTpData.told === 0
  ) {
    await redisClient.setJson(`${client.token}:passiveTp`, {
      ...passiveTpData,
      told: Date.now(),
    })
    say(
      client,
      t('chatters.noTp', {
        channel: `@${client.name}`,
        emote: 'HECANT',
        lng: client.locale,
      }),
      { chattersKey: 'noTp' }
    )
    return true
  }
}

const resetPassiveTime = async function resetPassiveTime(token: string) {
  // Reset the passive tp data in Redis
  await redisClient.setJson(`${token}:passiveTp`, {
    firstNoticedPassive: 0,
    told: 0,
  })
}
