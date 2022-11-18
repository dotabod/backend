import memoizee from 'memoizee'
import heroes from 'dotabase/json/heroes.json' assert { type: 'json' }

export const findHero = memoizee(function handleFindHero(name?: string) {
  if (!name || typeof name !== 'string' || name.length < 3) return null
  return heroes.find((hero) => hero.full_name === name)
})
