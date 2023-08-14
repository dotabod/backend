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
) {
  // Find the midas
  const midasItem = findItem('item_hand_of_midas', true, data)

  // Doesn't have a midas
  if (!midasItem || !midasItem[0]) return false

  // Midas was used recently, wait for it to be off CD
  if (isMidasOnCooldown(midasItem[0])) {
    // Tell chat it was used after x seconds
    if (passiveMidas.used) {
      const secondsToUse = Math.round((Date.now() - passiveMidas.used + 10000) / 1000)
      passiveMidas.used = 0
      return secondsToUse
    }

    resetPassiveMidas(passiveMidas)
    return false
  }

  updatePassiveMidasTimer(passiveMidas)

  // Every n seconds that it isn't used we say passive midas
  if (passiveMidas.timer >= 10000 && !passiveMidas.used) {
    passiveMidas.used = Date.now()
    resetPassiveMidas(passiveMidas)
    return true
  }

  return false
}

/**
 * Checks if the midas is on cooldown or not
 * @param midasItem - The midas item data
 */
function isMidasOnCooldown(midasItem: Item): boolean {
  return Number(midasItem.cooldown) > 0 && midasItem.can_cast !== true && midasItem.charges === 0
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
