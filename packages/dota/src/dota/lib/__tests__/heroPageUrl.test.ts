import { describe, expect, it } from 'bun:test'
import { getHeroPageUrl, withHeroLink } from '../heroes.ts'

describe('getHeroPageUrl', () => {
  it('builds the url from the stripped npc name', () => {
    expect(getHeroPageUrl(82)).toBe('dota2.com/hero/meepo')
  })

  it('uses the internal npc name, not the localized name', () => {
    // Shadow Fiend → npc_dota_hero_nevermore
    expect(getHeroPageUrl(11)).toBe('dota2.com/hero/nevermore')
    // Nature's Prophet → npc_dota_hero_furion
    expect(getHeroPageUrl(53)).toBe('dota2.com/hero/furion')
    // Doom → npc_dota_hero_doom_bringer (underscores preserved)
    expect(getHeroPageUrl(69)).toBe('dota2.com/hero/doom_bringer')
  })

  it('returns null for an unknown or missing id', () => {
    expect(getHeroPageUrl(0)).toBeNull()
    expect(getHeroPageUrl(undefined)).toBeNull()
    expect(getHeroPageUrl(99999)).toBeNull()
  })
})

describe('withHeroLink', () => {
  it('appends the hero link with a separator when the hero resolves', () => {
    expect(withHeroLink('Meepo facets: 1: Foo', 82)).toBe(
      'Meepo facets: 1: Foo · dota2.com/hero/meepo',
    )
  })

  it('returns the text unchanged when the hero cannot be resolved', () => {
    expect(withHeroLink('some text', 0)).toBe('some text')
    expect(withHeroLink('some text', undefined)).toBe('some text')
  })
})
