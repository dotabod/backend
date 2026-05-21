import { describe, expect, it } from 'bun:test'
import { transformBetData } from '../transformBetData.ts'

describe('transformBetData', () => {
  it('maps title and converts locked_at to an endDate', () => {
    const result = transformBetData({
      title: 'Will we win?',
      locked_at: '2026-05-20T00:00:00.000Z',
      outcomes: [],
    })

    expect(result.title).toBe('Will we win?')
    expect(result.endDate).toEqual(new Date('2026-05-20T00:00:00.000Z'))
    expect(result.outcomes).toEqual([])
  })

  it('uses empty string endDate when locked_at is absent', () => {
    const result = transformBetData({ title: 'No lock', outcomes: [] })
    expect(result.endDate).toBe('')
  })

  it('maps outcomes with top_predictors into totals and topUsers', () => {
    const result = transformBetData({
      title: 'Match',
      outcomes: [
        {
          title: 'Yes',
          channel_points: 500,
          users: 3,
          top_predictors: [
            { user_name: 'alice', channel_points_used: 100, channel_points_won: 200 },
          ],
        },
      ],
    })

    expect(result.outcomes).toEqual([
      {
        totalVotes: 500,
        totalUsers: 3,
        title: 'Yes',
        topUsers: [{ userDisplayName: 'alice', channelPointsUsed: 100, channelPointsWon: 200 }],
      },
    ])
  })

  it('leaves totals and topUsers undefined when top_predictors is absent', () => {
    const result = transformBetData({
      title: 'Match',
      outcomes: [{ title: 'No', channel_points: 500, users: 3 }],
    })

    expect(result.outcomes).toEqual([
      { totalVotes: undefined, totalUsers: undefined, title: 'No', topUsers: undefined },
    ])
  })

  it('returns undefined outcomes when none provided', () => {
    expect(transformBetData({ title: 'x' }).outcomes).toBeUndefined()
  })
})
