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
  const passiveMidas = ((await redisClient.client.json.get(`${token}:passiveMidas`)) as {
    firstNoticedPassive: number
    timer: number
    told: number
  } | null) || {
    firstNoticedPassive: 0,
    timer: 0,
    told: 0,
  }

  // Find the midas
  const midasItem = findItem('item_hand_of_midas', true, data)

  // Doesn't have a midas
  if (!midasItem || !midasItem[0]) return false

  // if 2 charges, the midas is passive, wait 10 seconds then tell chat
  if (Number(midasItem[0].charges) === 2) {
    if (!passiveMidas.told && !passiveMidas.firstNoticedPassive) {
      await redisClient.client.json.set(
        `${token}:passiveMidas`,
        '$.firstNoticedPassive',
        new Date().getTime(),
      )
      return false
    }

    if (new Date().getTime() - passiveMidas.firstNoticedPassive > 10000 && !passiveMidas.told) {
      await redisClient.client.json.set(`${token}:passiveMidas`, '$.told', new Date().getTime())
      return true
    }

    return false
  }

  // finally used the midas after who knows how long
  if (Number(midasItem[0].charges) !== 2) {
    if (passiveMidas.told) {
      const secondsToUse = Math.round((Date.now() - passiveMidas.told + 10000) / 1000)
      await resetPassiveTime(token)
      return secondsToUse
    } else {
      // they used it within 10 seconds, avoiding the nag message
      await resetPassiveTime(token)
      return false
    }
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
