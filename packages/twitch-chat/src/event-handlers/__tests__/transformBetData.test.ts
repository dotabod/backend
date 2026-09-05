import { describe, expect, it } from 'vitest'

import { transformBetData } from '../transformBetData.ts'

describe(transformBetData, () => {
  it('maps title and converts locked_at to an endDate', () => {
    const result = transformBetData({
      locked_at: '2026-05-20T00:00:00.000Z',
      outcomes: [],
      title: 'Will we win?',
    })

    expect(result.title).toBe('Will we win?')
    expect(result.endDate).toStrictEqual(new Date('2026-05-20T00:00:00.000Z'))
    expect(result.outcomes).toStrictEqual([])
  })

  it('uses empty string endDate when locked_at is absent', () => {
    const result = transformBetData({ outcomes: [], title: 'No lock' })
    expect(result.endDate).toBe('')
  })

  it('maps locks_at to endDate for begin/progress events', () => {
    const result = transformBetData({
      locks_at: '2026-06-01T12:00:00.000Z',
      outcomes: [],
      title: 'Will we win?',
    })

    expect(result.endDate).toStrictEqual(new Date('2026-06-01T12:00:00.000Z'))
  })

  it('maps ended_at to endDate for end events', () => {
    const result = transformBetData({
      ended_at: '2026-06-01T12:30:00.000Z',
      outcomes: [],
      title: 'Done',
    })

    expect(result.endDate).toStrictEqual(new Date('2026-06-01T12:30:00.000Z'))
  })

  it('prefers locks_at over locked_at over ended_at when multiple are present', () => {
    const result = transformBetData({
      ended_at: '2026-06-01T12:30:00.000Z',
      locked_at: '2026-06-01T12:15:00.000Z',
      locks_at: '2026-06-01T12:00:00.000Z',
      outcomes: [],
      title: 'Priority',
    })

    expect(result.endDate).toStrictEqual(new Date('2026-06-01T12:00:00.000Z'))

    const lockedAndEnded = transformBetData({
      ended_at: '2026-06-01T12:30:00.000Z',
      locked_at: '2026-06-01T12:15:00.000Z',
      outcomes: [],
      title: 'Locked',
    })

    expect(lockedAndEnded.endDate).toStrictEqual(new Date('2026-06-01T12:15:00.000Z'))
  })

  it('maps outcomes with top_predictors into totals and topUsers', () => {
    const result = transformBetData({
      outcomes: [
        {
          channel_points: 500,
          title: 'Yes',
          top_predictors: [
            { user_name: 'alice', channel_points_used: 100, channel_points_won: 200 },
          ],
          users: 3,
        },
      ],
      title: 'Match',
    })

    expect(result.outcomes).toStrictEqual([
      {
        title: 'Yes',
        topUsers: [{ channelPointsUsed: 100, channelPointsWon: 200, userDisplayName: 'alice' }],
        totalUsers: 3,
        totalVotes: 500,
      },
    ])
  })

  it('leaves totals and topUsers undefined when top_predictors is absent', () => {
    const result = transformBetData({
      outcomes: [{ channel_points: 500, title: 'No', users: 3 }],
      title: 'Match',
    })

    expect(result.outcomes).toStrictEqual([
      { title: 'No', topUsers: undefined, totalUsers: undefined, totalVotes: undefined },
    ])
  })

  it('returns undefined outcomes when none provided', () => {
    expect(transformBetData({ title: 'x' }).outcomes).toBeUndefined()
  })

  it('passes null channel_points_won through (refund/loss case per Twitch spec)', () => {
    const result = transformBetData({
      outcomes: [
        {
          channel_points: 100,
          title: 'Yes',
          top_predictors: [
            { user_name: 'bob', channel_points_used: 100, channel_points_won: null },
          ],
          users: 1,
        },
      ],
      title: 'Refund?',
    })

    expect(result.outcomes?.[0].topUsers).toStrictEqual([
      { channelPointsUsed: 100, channelPointsWon: null, userDisplayName: 'bob' },
    ])
  })
})
