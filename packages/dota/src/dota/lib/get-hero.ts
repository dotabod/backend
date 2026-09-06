import { heroes } from './hero-list'

export type HeroNames = `npc_dota_hero_${string}`

export default function handleGetHero(name?: string | null) {
  if (name === null || name === undefined || name.length < 3) {
    return null
  }
  return heroes[name]
}
