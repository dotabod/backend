import { t } from 'i18next'

import { Packet } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { GSIHandler, redisClient } from '../GSIHandler.js'
import { findItem } from './findItem.js'

export function chatMidas(dotaClient: GSIHandler, isMidasPassive: number | boolean) {
  if (typeof isMidasPassive === 'number') {
    dotaClient.say(
      t('midasUsed', {
        emote: 'Madge',
        lng: dotaClient.client.locale,
        seconds: isMidasPassive,
      }),
    )
  } else if (isMidasPassive) {
    logger.info('[MIDAS] Passive midas', { name: dotaClient.getChannel() })
    dotaClient.say(t('chatters.midas', { emote: 'massivePIDAS', lng: dotaClient.client.locale }))
  }
}

/**
 * Checks if the player has a midas and if it's on cooldown or not
 * @param data - The packet with all the player data
 * @param passiveMidas - The object with the passive midas data
 */
export async function checkMidas(data: Packet, token: string) {
  // Find the midas
  const midasItem = findItem('item_hand_of_midas', true, data)

  // Doesn't have a midas
  if (!midasItem || !midasItem[0]) return false

  const passiveMidas = ((await redisClient.client.json.get(`${token}:passiveMidas`)) as {
    firstNoticedPassive: number
    timer: number
    told: number
  } | null) || {
    firstNoticedPassive: 0,
    timer: 0,
    told: 0,
  }

  const charges = Number(midasItem[0].charges)
  const currentTime = new Date().getTime()
  const passiveTimeThreshold = 10000

  if (charges === 2 && !passiveMidas.told && !passiveMidas.firstNoticedPassive) {
    await redisClient.client.json.set(`${token}:passiveMidas`, '$.firstNoticedPassive', currentTime)
    return false
  } else if (
    charges === 2 &&
    currentTime - passiveMidas.firstNoticedPassive > passiveTimeThreshold &&
    !passiveMidas.told
  ) {
    await redisClient.client.json.set(`${token}:passiveMidas`, '$.told', currentTime)
    return true
  } else if (charges !== 2 && passiveMidas.told) {
    const secondsToUse = Math.round((Date.now() - passiveMidas.told + passiveTimeThreshold) / 1000)
    await resetPassiveTime(token)
    return secondsToUse
  } else if (charges !== 2) {
    await resetPassiveTime(token)
    return false
  }

  return false
}

/**
 * Resets the passive midas data
 * @param passiveMidas - The object with the passive midas data
 */
async function resetPassiveTime(token: string) {
  await redisClient.client.json.set(`${token}:passiveMidas`, '$', {
    firstNoticedPassive: 0,
    timer: 0,
    told: 0,
  })
}
