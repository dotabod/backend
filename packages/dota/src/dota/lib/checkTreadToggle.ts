import RedisClient from '../../db/RedisClient.js'
import type { GSIHandlerType } from '../GSIHandlerTypes.js'
import { findItem } from './findItem.js'

export async function calculateManaSaved(dotaClient: GSIHandlerType) {
  const { treadsData } = dotaClient
  const data = dotaClient.client.gsi

  if (!data?.hero?.mana || !data.hero.max_mana) return
  const hasPowerTreads = findItem({ itemName: 'item_power_treads', searchStashAlso: false, data })
  if (!hasPowerTreads || !hasPowerTreads[0]) return

  const maxMana = data.hero.max_mana
  const prevMaxMana = data.previously?.hero?.max_mana ?? 0

  const didToggleToInt = maxMana - prevMaxMana === 120
  const didToggleOffInt = maxMana - prevMaxMana === -120

  const redisClient = RedisClient.getInstance()
  if (didToggleToInt) {
    treadsData.manaAtLastToggle = data.hero.mana

    await redisClient.client.json.set(`${dotaClient.getToken()}:treadtoggle`, '$', { treadsData })

    // Come back when we toggle off int
    return
  }

  // Calculate total mana saved
  if (didToggleOffInt) {
    const diff = treadsData.manaAtLastToggle - data.hero.mana - 120
    const mana = diff > 0 ? diff : 0
    if (mana > 0) {
      treadsData.treadToggles++
      treadsData.manaSaved += mana
    }

    await redisClient.client.json.set(`${dotaClient.getToken()}:treadtoggle`, '$', { treadsData })
    return
  }

  await redisClient.client.json.set(`${dotaClient.getToken()}:treadtoggle`, '$', { treadsData })
  return
}
