import { Packet } from '../../types.js'
import { findItem } from './findItem.js'

export function calculateManaSaved(
  treadsData: { manaAtLastToggle: number; timeOfLastToggle: number },
  data?: Packet,
) {
  if (!data?.hero?.mana || !data.hero.max_mana) return 0
  const hasPowerTreads = findItem('item_power_treads', false, data)
  if (!hasPowerTreads || !hasPowerTreads[0]) return 0

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
