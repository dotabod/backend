import { describe, expect, it } from 'vitest'

import { getPlayableSourceTvGames } from '../source-tv-games'

describe(getPlayableSourceTvGames, () => {
  it('ignores a bad SourceTV response', () => {
    expect(getPlayableSourceTvGames(null)).toStrictEqual([])
  })
})
