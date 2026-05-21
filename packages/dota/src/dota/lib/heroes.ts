import { t } from 'i18next'
import type { HeroNames } from './getHero'
import { heroes } from './heroList'

export const translatedColor = (color: string, lng: string) => {
  if (lng === 'en') return color

  const props = { lng }
  switch (color) {
    case 'Blue':
      return t('colors.blue', props)
    case 'Teal':
      return t('colors.teal', props)
    case 'Purple':
      return t('colors.purple', props)
    case 'Yellow':
      return t('colors.yellow', props)
    case 'Orange':
      return t('colors.orange', props)
    case 'Pink':
      return t('colors.pink', props)
    case 'Olive':
      return t('colors.olive', props)
    case 'Cyan':
      return t('colors.cyan', props)
    case 'Green':
      return t('colors.green', props)
    case 'Brown':
      return t('colors.brown', props)
    default:
      return color
  }
}

export const heroColors = 'Blue,Teal,Purple,Yellow,Orange,Pink,Olive,Cyan,Green,Brown'.split(',')
export function getHeroNameOrColor(id?: number, index?: number) {
  if (!id && typeof index === 'number') return heroColors[index]

  const hero = getHeroById(id)
  const name = hero?.localized_name
  if (!name && typeof index === 'number') {
    return heroColors[index]
  }

  return name ?? 'Unknown'
}

export function getHeroById(id?: number) {
  if (!id) return null

  for (const [key, hero] of Object.entries(heroes)) {
    if (hero.id === id) {
      return { ...hero, key: key as HeroNames }
    }
  }

  return null
}

export function getHeroPageUrl(id?: number): string | null {
  const hero = getHeroById(id)
  if (!hero) return null
  return `dota2.com/hero/${hero.key.replace('npc_dota_hero_', '')}`
}

export function withHeroLink(text: string, id?: number): string {
  const url = getHeroPageUrl(id)
  return url ? `${text} · ${url}` : text
}

export function getHeroByName(name: string, heroIdsInMatch?: (number | undefined)[]) {
  if (!name) return null

  // only keep a-z in name
  const localName = name
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
    .trim()

  let lookInHeroes = Object.values(heroes)
  if (
    heroIdsInMatch?.length &&
    heroIdsInMatch.filter(Boolean).length > 1 &&
    heroIdsInMatch.length !== 1
  ) {
    lookInHeroes = Object.values(heroes).filter((hero) => heroIdsInMatch.includes(hero.id))
  }

  // alias lookup first
  let hero = lookInHeroes.find((h) => {
    const hasAlias = h.alias.some(
      (alias) =>
        alias
          .replace(/[^a-z]/gi, '')
          .toLowerCase()
          .trim() === localName,
    )

    return hasAlias
  })

  // then hero name
  if (!hero) {
    hero = lookInHeroes.find((h) => {
      const inName = h.localized_name
        // replace all spaces with nothing, and only keep a-z
        .replace(/[^a-z]/gi, '')
        .toLowerCase()
        .trim()

      return inName.includes(localName)
    })
  }

  return hero
}

export default heroes
