import { heroes } from './heroList'

export type HeroNames = `npc_dota_hero_${string}`

export default function handleGetHero(name?: HeroNames) {
  if (!name || typeof name !== 'string' || name.length < 3) return null
  return heroes[name]
}
