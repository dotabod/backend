import { Dota2, SlotsIds } from '../types'

// Stash is fountain stash
// Slots 0-5 are the backpack
// Slots 6-8 are the backpack stashed items
export default function checkMidas(data: Dota2, passiveMidas: { counter: number }) {
  if (!data.items) return false

  // User is dead
  if (data.hero?.alive === false) {
    passiveMidas.counter = 0
    return false
  }

  const midas = 'item_hand_of_midas'

  // Should always be 17 unless they're disconnected or something
  if (Object.keys(data.items).length !== 17) return false

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const slots = [...Array(9).keys()] as SlotsIds[]
  let midasSlot: SlotsIds | undefined

  // Find the slot the midas is sitting in
  // TODO: Extract to a function to find an item?
  midasSlot = slots.find((slotKey: number) => {
    if (data.items?.[`slot${slotKey as SlotsIds}`]?.name === midas) {
      midasSlot = slotKey as SlotsIds
      return slotKey as SlotsIds
    }
    return undefined
  })

  // Doesn't have a midas
  if (!midasSlot) return false

  const midasItem = data.items[`slot${midasSlot}`]

  // Midas was used recently, wait for it to be off CD
  if (Number(midasItem?.cooldown) > 0) {
    passiveMidas.counter = 0
    return false
  }

  // +1 second each iteration
  passiveMidas.counter += 1

  // Every 75s that it isn't used we say passive midas
  if (passiveMidas.counter === 75) {
    passiveMidas.counter = 0
    return true
  }

  return false
}
