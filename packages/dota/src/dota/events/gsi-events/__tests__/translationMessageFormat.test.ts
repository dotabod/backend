import { beforeAll, describe, expect, it } from 'bun:test'
import i18next from 'i18next'

import {
  formatTranslatedInGameChatMessage,
  formatTranslatedInGameChatMessages,
  formatTranslatedSpeakerLabel,
} from '../translationMessageFormat.js'

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
              message: '[In-game chat translation] {{- message}} (auto-translated, may be inaccurate)',
              playerLabel: 'Player {{playerId}}',
              speakerLabel: '{{- heroName}} (P{{playerId}})',
            },
          },
        },
      },
    })
  })

  it('marks fallback hero labels as player labels', () => {
    expect(formatTranslatedSpeakerLabel('Hero 2', 2, 'en')).toBe('Player 2')
    expect(formatTranslatedSpeakerLabel('2', 2, 'en')).toBe('Player 2')
  })

  it('includes player slot for known hero labels', () => {
    expect(formatTranslatedSpeakerLabel('Crystal Maiden', 4, 'en')).toBe('Crystal Maiden (P4)')
  })

  it('adds translated in-game chat prefix and disclaimer', () => {
    expect(formatTranslatedInGameChatMessage('Player 2: where shard', 'en')).toBe(
      '[In-game chat translation] Player 2: where shard (auto-translated, may be inaccurate)',
    )
  })

  it('splits translated messages to stay within twitch length limit', () => {
    const longMessageA = `Player 1: ${'a'.repeat(220)}`
    const longMessageB = `Player 2: ${'b'.repeat(220)}`
    const split = formatTranslatedInGameChatMessages(
      `${longMessageA} | ${longMessageB}`,
      'en',
      500,
    )

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
