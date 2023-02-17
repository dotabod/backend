import heroes from './heroes.js'

export type HeroNames = keyof typeof heroes

export default function handleGetHero(name?: HeroNames | null) {
  if (!name || typeof name !== 'string' || name.length < 3) return null
  return heroes[name]
}
