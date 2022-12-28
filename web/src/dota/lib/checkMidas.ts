import { Item, Packet } from '../../types.js';

const midas = 'item_hand_of_midas'
export default function checkMidas(
  data: Packet,
  passiveMidas: { counter: number; used: number; timer: number },
) {
  if (!data.items) return false

  // User is dead
  if (data.hero?.alive === false) {
    resetPassiveMidas(passiveMidas)
    return false
  }

  // Should always be 17 unless they're disconnected or something
  if (Object.keys(data.items).length !== 17) return false

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const inv = Object.values(data.items)
  const midasItem: Item | undefined = inv.slice(0, 9).find((item: Item) => item.name === midas)

  // Doesn't have a midas
  if (!midasItem) return false

  // Midas was used recently, wait for it to be off CD
  if (isMidasOnCooldown(midasItem)) {
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
  return Number(midasItem.cooldown) > 0
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
