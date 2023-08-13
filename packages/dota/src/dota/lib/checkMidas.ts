import { Item, Packet } from '../../types.js'
import { findItem } from './findItem.js'

/**
 * Checks if the player has a midas and if it's on cooldown or not
 * @param data - The packet with all the player data
 * @param passiveMidas - The object with the passive midas data
 */
export default function checkMidas(
  data: Packet,
  passiveMidas: { counter: number; used: number; timer: number },
): boolean | number {
  const midasItem = findItem('item_hand_of_midas', true, data)

  if (!midasItem || !midasItem[0]) return false

  // If Midas has 2 charges and is not on cooldown, it's passive
  if (midasItem[0].charges === 2 && !isMidasOnCooldown(midasItem[0])) {
    passiveMidas.used = Date.now()
    resetPassiveMidas(passiveMidas)
    return true
  }

  // If Midas has 1 charge, it might have been used once
  if (midasItem[0].charges === 1 && !isMidasOnCooldown(midasItem[0])) {
    updatePassiveMidasTimer(passiveMidas)
    if (passiveMidas.timer >= 10000 && !passiveMidas.used) {
      passiveMidas.used = Date.now()
      resetPassiveMidas(passiveMidas)
      return true
    }
  }

  if (isMidasOnCooldown(midasItem[0])) {
    // Tell chat it was used after x seconds
    if (passiveMidas.used) {
      const secondsToUse = Math.round((Date.now() - passiveMidas.used + 10000) / 1000)
      passiveMidas.used = 0
      return secondsToUse
    }
    resetPassiveMidas(passiveMidas)
  }

  return false
}

/**
 * Checks if the midas is on cooldown or not
 * @param midasItem - The midas item data
 */
function isMidasOnCooldown(midasItem: Item): boolean {
  // If the Midas has any charge available, it's not on cooldown
  if ((midasItem.charges || 0) > 0) return false

  // Otherwise, check the cooldown
  return Number(midasItem.cooldown) > 0 || midasItem.can_cast !== true
}

/**
 * Updates the passive midas timer
 * @param passiveMidas - The object with the passive midas data
 */
function updatePassiveMidasTimer(passiveMidas: {
  counter: number
  used: number
  timer: number
}): void {
  const currentTime = Date.now()
  if (passiveMidas.counter === 0) {
    passiveMidas.counter = currentTime
  } else {
    passiveMidas.timer += currentTime - passiveMidas.counter
    passiveMidas.counter = currentTime
  }
}

/**
 * Resets the passive midas data
 * @param passiveMidas - The object with the passive midas data
 */
function resetPassiveMidas(passiveMidas: { counter: number; used: number; timer: number }): void {
  passiveMidas.counter = 0
  passiveMidas.timer = 0
}
