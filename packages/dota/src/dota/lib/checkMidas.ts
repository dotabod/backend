import { t } from 'i18next'

import { Item, Packet } from '../../types.js'
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
    return
  }

  if (isMidasPassive) {
    logger.info('[MIDAS] Passive midas', { name: dotaClient.getChannel() })
    dotaClient.say(t('chatters.midas', { emote: 'massivePIDAS', lng: dotaClient.client.locale }))
    return
  }
}

/**
 * Checks if the player has a midas and if it's on cooldown or not
 * @param data - The packet with all the player data
 * @param passiveMidas - The object with the passive midas data
 */
export async function checkMidas(data: Packet, token: string) {
  const passiveMidas = ((await redisClient.client.get(`${token}:passiveMidas`)) as {
    counter: number
    used: number
    timer: number
  } | null) || {
    counter: 0,
    used: 0,
    timer: 0,
  }

  // Find the midas
  const midasItem = findItem('item_hand_of_midas', true, data)

  // Doesn't have a midas
  if (!midasItem || !midasItem[0]) return false

  // Midas was used recently, wait for it to be off CD
  if (isMidasOnCooldown(midasItem[0])) {
    // Tell chat it was used after x seconds
    if (passiveMidas.used) {
      const secondsToUse = Math.round((Date.now() - passiveMidas.used + 10000) / 1000)
      await redisClient.client.json.set(`${token}:passiveMidas`, '$.used', 0)
      return secondsToUse
    }

    await resetPassiveMidas(token)
    return false
  }

  await updatePassiveMidasTimer(token, passiveMidas)

  // Every n seconds that it isn't used we say passive midas
  if (passiveMidas.timer >= 10000 && !passiveMidas.used) {
    await redisClient.client.json.set(`${token}:passiveMidas`, '$.used', Date.now())
    await resetPassiveMidas(token)
    return true
  }

  return false
}

/**
 * Checks if the midas is on cooldown or not
 * @param midasItem - The midas item data
 */
function isMidasOnCooldown(midasItem: Item): boolean {
  return (Number(midasItem.cooldown) > 0 && midasItem.charges === 0) || midasItem.can_cast !== true
}
/**
 * Updates the passive midas timer
 * @param token - The token associated with the data
 * @param passiveMidas - The object with the passive midas data
 */
async function updatePassiveMidasTimer(
  token: string,
  passiveMidas: {
    counter: number
    used: number
    timer: number
  },
): Promise<void> {
  const currentTime = Date.now()
  if (passiveMidas.counter !== 0) {
    passiveMidas.timer += currentTime - passiveMidas.counter
  }

  passiveMidas.counter = currentTime
  await redisClient.client.json.set(`${token}:passiveMidas`, '$', passiveMidas)
}

/**
 * Resets the passive midas data
 * @param passiveMidas - The object with the passive midas data
 */
async function resetPassiveMidas(token: string) {
  await redisClient.client.json.set(`${token}:passiveMidas`, '$.counter', 0)
  await redisClient.client.json.set(`${token}:passiveMidas`, '$.timer', 0)
}
