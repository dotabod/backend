import { describe, expect, it } from 'bun:test'
import { getHeroPageUrl, withHeroLink } from '../heroes.ts'

describe('getHeroPageUrl', () => {
  it('builds the url from the localized name, lowercased without spaces', () => {
    expect(getHeroPageUrl(82)).toBe('dota2.com/hero/meepo')
  })

  it('uses the localized name, not the internal npc name', () => {
    // Shadow Fiend (npc_dota_hero_nevermore) → /hero/shadowfiend
    expect(getHeroPageUrl(11)).toBe('dota2.com/hero/shadowfiend')
    // Nature's Prophet (npc_dota_hero_furion) → keeps the apostrophe
    expect(getHeroPageUrl(53)).toBe("dota2.com/hero/nature'sprophet")
    // Doom (npc_dota_hero_doom_bringer) → /hero/doom
    expect(getHeroPageUrl(69)).toBe('dota2.com/hero/doom')
    // Anti-Mage → keeps the hyphen
    expect(getHeroPageUrl(1)).toBe('dota2.com/hero/anti-mage')
  })

  it('overrides Outworld Devourer (dotaconstants) to the renamed dota2.com slug', () => {
    expect(getHeroPageUrl(76)).toBe('dota2.com/hero/outworlddestroyer')
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
