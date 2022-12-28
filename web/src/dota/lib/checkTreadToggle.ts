import { Item, Packet } from '../../types.js'

const treads = 'item_power_treads'
function findTreads(data?: Packet) {
  if (!data?.items) return false

  // Should always be 17 unless they're disconnected or something
  if (Object.keys(data.items).length !== 17) return false

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const inv = Object.values(data.items)
  const midasItem: Item | undefined = inv.slice(0, 6).find((item: Item) => item.name === treads)

  // Doesn't have a midas
  if (!midasItem) return false

  return midasItem
}

export function calculateManaSaved(
  treadsData: { manaAtLastToggle: number; timeOfLastToggle: number },
  data?: Packet,
) {
  if (!data?.hero?.mana || !data.hero.max_mana) return 0
  const hasPowerTreads = findTreads(data)
  if (!hasPowerTreads) return 0

  const maxMana = data.hero.max_mana
  const prevMaxMana = data.previously?.hero?.max_mana ?? 0

  const didToggleToInt = maxMana - prevMaxMana === 120
  const didToggleOffInt = maxMana - prevMaxMana === -120

  if (didToggleToInt) {
    treadsData.timeOfLastToggle = Date.now()
    treadsData.manaAtLastToggle = data.hero.mana
    // Come back when we toggle off int
    return 0
  }

  // Calculate total mana saved
  if (didToggleOffInt) {
    treadsData.timeOfLastToggle = 0
    const diff = treadsData.manaAtLastToggle - data.hero.mana - 120
    return diff > 0 ? diff : 0
  }

  return 0
}
