import { Item, Packet } from '../../types.js'
import { findItem } from './findItem.js'

export default function checkMidas(
  data: Packet,
  passiveMidas: { counter: number; used: number; timer: number },
) {
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

function isMidasOnCooldown(midasItem: Item): boolean {
  return Number(midasItem.cooldown) > 0 || !midasItem.can_cast
}

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

function resetPassiveMidas(passiveMidas: { counter: number; used: number; timer: number }): void {
  passiveMidas.counter = 0
  passiveMidas.timer = 0
}
