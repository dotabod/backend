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
  // Initialize variables to track the mana saved and the time spent
  // in the intelligence bonus
  let manaSaved = 0
  let timeSpentInIntelligence = 0

  const hasPowerTreads = findTreads(data)
  if (!data?.hero?.mana) return 0

  // Check if the player has power treads and if they are currently
  // in the intelligence bonus
  if (hasPowerTreads && player.powerTreadsBonus === 'intelligence') {
    // Calculate the amount of time the player has spent in the intelligence
    // bonus by checking the current game time and the time the player
    // last toggled the power treads
    timeSpentInIntelligence = Date.now() - treadsData.timeOfLastToggle

    // Calculate the amount of mana that has been regenerated while the
    // player was in the intelligence bonus by using the hero's current
    // mana and the time spent in the intelligence bonus to estimate the
    // mana regeneration rate
    manaSaved = (data.hero.mana - treadsData.manaAtLastToggle) / timeSpentInIntelligence
  }

  // Return the mana saved
  return manaSaved
}
