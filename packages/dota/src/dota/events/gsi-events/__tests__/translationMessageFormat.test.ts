import { beforeAll, describe, expect, it } from 'bun:test'
import i18next from 'i18next'

import {
  formatTranslatedInGameChatMessage,
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
    expect(formatTranslatedSpeakerLabel('Hero 2', 2, 'en', true)).toBe('Player 2')
    expect(formatTranslatedSpeakerLabel('2', 2, 'en', true)).toBe('Player 2')
  })

  it('includes player slot for known hero labels', () => {
    expect(formatTranslatedSpeakerLabel('Crystal Maiden', 4, 'en', false)).toBe(
      'Crystal Maiden (P4)',
    )
  })

  it('adds translated in-game chat prefix and disclaimer', () => {
    expect(formatTranslatedInGameChatMessage('Player 2: where shard', 'en')).toBe(
      '[In-game chat translation] Player 2: where shard (auto-translated, may be inaccurate)',
    )
  })
})
