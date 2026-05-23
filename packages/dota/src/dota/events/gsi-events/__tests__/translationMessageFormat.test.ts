import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import i18next from 'i18next'
import { initTestI18n } from '../../../../__tests__/sharedMocks'

import {
  formatTranslatedInGameChatMessage,
  formatTranslatedInGameChatMessages,
  formatTranslatedSpeakerLabel,
  resolveTranslatedHeroName,
} from '../translationMessageFormat'

describe('translation message formatting', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: {
          translation: {
            chatTranslation: {
              legacyHeroLabel: 'Hero {{playerId}}',
              message:
                '[In-game chat translation] {{- message}} (auto-translated, may be inaccurate)',
              playerLabel: 'Player {{playerId}}',
              speakerLabel: '{{- heroName}} (P{{playerId}})',
              unknownPlayer: 'a player',
            },
          },
        },
      },
    })
  })

  // If i18next.init() above re-initialized with the narrow bundle it would
  // break sibling test files that expect the full English bundle. Restore it
  // here so subsequent tests (regardless of file order) find all keys.
  afterAll(async () => {
    await initTestI18n()
  })

  it('maps fallback hero labels to a neutral player label (no positional number)', () => {
    // never "Player 2"/"P2" — the number would misread as the 2nd top-bar slot
    expect(formatTranslatedSpeakerLabel('Hero 2', 2, 'en')).toBe('a player')
    expect(formatTranslatedSpeakerLabel('2', 2, 'en')).toBe('a player')
  })

  it('shows only the hero name (no positional suffix) for known heroes', () => {
    // we deliberately do NOT append "(P4)" — the number would misread as a top-bar slot
    expect(formatTranslatedSpeakerLabel('Crystal Maiden', 4, 'en')).toBe('Crystal Maiden')
  })

  describe('resolveTranslatedHeroName', () => {
    it('uses the resolved name when the slot was found in the roster', () => {
      // even for 8500+, a real roster hit is trustworthy
      expect(
        resolveTranslatedHeroName({
          heroName: 'Invoker',
          playerId: 9,
          foundInMatchPlayers: true,
          isHighMmr: true,
          locale: 'en',
        }),
      ).toBe('Invoker')
    })

    it('falls back to a neutral player label for 8500+ when slot not in roster', () => {
      // player_id is reshuffled at 8500+, so the color guess would be wrong
      expect(
        resolveTranslatedHeroName({
          heroName: 'Brown',
          playerId: 9,
          foundInMatchPlayers: false,
          isHighMmr: true,
          locale: 'en',
        }),
      ).toBe('Hero 9')
    })

    it('keeps the player-slot color sub-8500 when slot not in roster', () => {
      expect(
        resolveTranslatedHeroName({
          heroName: 'Green',
          playerId: 8,
          foundInMatchPlayers: false,
          isHighMmr: false,
          locale: 'en',
        }),
      ).toBe('Green')
    })

    it('falls back to the player_id string when no name is known', () => {
      expect(
        resolveTranslatedHeroName({
          heroName: '',
          playerId: 3,
          foundInMatchPlayers: false,
          isHighMmr: false,
          locale: 'en',
        }),
      ).toBe('3')
    })
  })

  it('adds translated in-game chat prefix and disclaimer', () => {
    expect(formatTranslatedInGameChatMessage('Player 2: where shard', 'en')).toBe(
      '[In-game chat translation] Player 2: where shard (auto-translated, may be inaccurate)',
    )
  })

  it('splits translated messages to stay within twitch length limit', () => {
    const longMessageA = `Player 1: ${'a'.repeat(220)}`
    const longMessageB = `Player 2: ${'b'.repeat(220)}`
    const split = formatTranslatedInGameChatMessages(`${longMessageA} | ${longMessageB}`, 'en', 500)

    expect(split.length).toBe(2)
    for (const message of split) {
      expect(message.length).toBeLessThanOrEqual(500)
    }
  })

  it('truncates oversized translated segments to stay within twitch length limit', () => {
    const split = formatTranslatedInGameChatMessages(`Player 1: ${'x'.repeat(700)}`, 'en', 500)

    expect(split.length).toBe(1)
    expect(split[0].length).toBeLessThanOrEqual(500)
    expect(split[0]).toContain('…')
  })
})
