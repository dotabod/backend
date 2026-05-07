import { describe, expect, it } from 'bun:test'

import {
  formatTranslatedInGameChatMessage,
  formatTranslatedSpeakerLabel,
} from '../translationMessageFormat.js'

describe('translation message formatting', () => {
  it('marks fallback hero labels as player labels', () => {
    expect(formatTranslatedSpeakerLabel('Hero 2', 2)).toBe('Player 2')
    expect(formatTranslatedSpeakerLabel('2', 2)).toBe('Player 2')
  })

  it('includes player slot for known hero labels', () => {
    expect(formatTranslatedSpeakerLabel('Crystal Maiden', 4)).toBe('Crystal Maiden (P4)')
  })

  it('adds translated in-game chat prefix and disclaimer', () => {
    expect(formatTranslatedInGameChatMessage('Player 2: white slard')).toBe(
      '[In-game chat translation] Player 2: white slard (auto-translated, may be inaccurate)',
    )
  })
})
