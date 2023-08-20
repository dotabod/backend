import { t } from 'i18next'

import { Packet } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { GSIHandler, redisClient } from '../GSIHandler.js'
import { findItem } from './findItem.js'

/**
 * Sends a chat message about Midas usage
 * @param dotaClient - The Dota client connection
 * @param isMidasPassive - Whether the Midas is passive or how long it took to use it
 */
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
 * @param token - The token used for Redis operations
 */
export async function checkMidas(data: Packet, token: string) {
  // Find the midas in player's inventory
  const midasItem = findItem('item_hand_of_midas', true, data)

  // Check if player has a midas
  if (!midasItem || !midasItem[0]) return false

  // Get passive midas data from Redis
  const passiveMidasData = ((await redisClient.client.json.get(`${token}:passiveMidas`)) as {
    firstNoticedPassive: number
    timer: number
    told: number
  } | null) || {
    firstNoticedPassive: 0,
    timer: 0,
    told: 0,
  }

  const midasCharges = Number(midasItem[0].charges)
  const currentTime = new Date().getTime()
  const passiveMidasThreshold = 10000

  if (midasCharges === 2 && !passiveMidasData.told && !passiveMidasData.firstNoticedPassive) {
    // Set the time when passive midas was first noticed
    await redisClient.client.json.set(`${token}:passiveMidas`, '$.firstNoticedPassive', currentTime)
    return false
  } else if (
    midasCharges === 2 &&
    currentTime - passiveMidasData.firstNoticedPassive > passiveMidasThreshold &&
    !passiveMidasData.told
  ) {
    // Set the time when passive midas was told to chat
    await redisClient.client.json.set(`${token}:passiveMidas`, '$.told', currentTime)
    return true
  } else if (midasCharges !== 2 && passiveMidasData.told) {
    // Calculate the time taken to use midas after being passive
    const secondsToUse = Math.round(
      (Date.now() - passiveMidasData.told + passiveMidasThreshold) / 1000,
    )
    // Reset passive midas data
    await resetPassiveTime(token)
    return secondsToUse
  } else if (midasCharges !== 2) {
    // Reset passive midas data
    await resetPassiveTime(token)
    return false
  }

  return false
}

/**
 * Resets the passive midas data
 * @param token - The token used for Redis operations
 */
async function resetPassiveTime(token: string) {
  // Reset the passive midas data in Redis
  await redisClient.client.json.set(`${token}:passiveMidas`, '$', {
    firstNoticedPassive: 0,
    timer: 0,
    told: 0,
  })
}
