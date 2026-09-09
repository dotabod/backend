import { describe, expect, it } from 'vitest'

import { isBadSourceTvGamesResponse } from '../source-tv-games'

describe(isBadSourceTvGamesResponse, () => {
  it('identifies a bad SourceTV response', () => {
    expect(isBadSourceTvGamesResponse(null)).toBeTruthy()
  })
})
