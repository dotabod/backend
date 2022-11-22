import heroes from 'dotaconstants/build/hero_names.json' assert { type: 'json' }
import memoizee from 'memoizee'

export type HeroNames = keyof typeof heroes

export const findHero = memoizee(function handleFindHero(name?: HeroNames) {
  if (!name || typeof name !== 'string' || name.length < 3) return null
  return heroes[name]
})
