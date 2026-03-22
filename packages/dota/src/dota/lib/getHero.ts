import { heroes } from './heroList.js'

export type HeroNames = string

export default function handleGetHero(name?: HeroNames) {
  if (!name || typeof name !== 'string' || name.length < 3) return null
  return heroes[name]
}
