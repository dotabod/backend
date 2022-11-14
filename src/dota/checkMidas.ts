// Stash is fountain stash
// Slots 0-5 are the backpack

import { SlotsIds } from 'dotagsi/types/dota2'
import { Dota2 } from '../../types'

// Slots 6-8 are the backpack stashed items
export default function checkMidas(data: Dota2) {
  if (!data?.items) return false

  const midas = 'item_hand_of_midas'

  // Should always be 17 unless they're disconnected or something
  if (Object.keys(data.items).length !== 17) return false

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const slots = [...Array(9).keys()]
  let midasSlot = null

  // Find the slot the midas is sitting in
  // TODO: Extract to a function to find an item?
  slots.some((slotKey) => {
    if (data?.items?.[`slot${slotKey as SlotsIds}`]?.name === midas) {
      midasSlot = slotKey as SlotsIds
      return true
    }
    return false
  })

  // Doesn't have a midas
  if (!midasSlot) return false

  const midasItem = data.items[`slot${midasSlot}`]

  // Midas was used recently, wait for it to be off CD
  if (midasItem?.cooldown > 0) {
    passiveMidas.counter = 0
    return false
  }

  // +1 second each iteration, waiting for it to be off cd
  passiveMidas.counter += 1

  // Now its been 25s AFTER it was last used, very passive midas >:(
  if (passiveMidas.counter === 25) {
    passiveMidas.counter = -50
    return true
  }

  return false
}
