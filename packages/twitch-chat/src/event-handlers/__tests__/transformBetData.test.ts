import { describe, expect, it } from 'vite-plus/test'
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

  it('maps locks_at to endDate for begin/progress events', () => {
    const result = transformBetData({
      title: 'Will we win?',
      locks_at: '2026-06-01T12:00:00.000Z',
      outcomes: [],
    })

    expect(result.endDate).toEqual(new Date('2026-06-01T12:00:00.000Z'))
  })

  it('maps ended_at to endDate for end events', () => {
    const result = transformBetData({
      title: 'Done',
      ended_at: '2026-06-01T12:30:00.000Z',
      outcomes: [],
    })

    expect(result.endDate).toEqual(new Date('2026-06-01T12:30:00.000Z'))
  })

  it('prefers locks_at over locked_at over ended_at when multiple are present', () => {
    const result = transformBetData({
      title: 'Priority',
      locks_at: '2026-06-01T12:00:00.000Z',
      locked_at: '2026-06-01T12:15:00.000Z',
      ended_at: '2026-06-01T12:30:00.000Z',
      outcomes: [],
    })

    expect(result.endDate).toEqual(new Date('2026-06-01T12:00:00.000Z'))

    const lockedAndEnded = transformBetData({
      title: 'Locked',
      locked_at: '2026-06-01T12:15:00.000Z',
      ended_at: '2026-06-01T12:30:00.000Z',
      outcomes: [],
    })

    expect(lockedAndEnded.endDate).toEqual(new Date('2026-06-01T12:15:00.000Z'))
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

  it('passes null channel_points_won through (refund/loss case per Twitch spec)', () => {
    const result = transformBetData({
      title: 'Refund?',
      outcomes: [
        {
          title: 'Yes',
          channel_points: 100,
          users: 1,
          top_predictors: [
            { user_name: 'bob', channel_points_used: 100, channel_points_won: null },
          ],
        },
      ],
    })

    expect(result.outcomes?.[0].topUsers).toEqual([
      { userDisplayName: 'bob', channelPointsUsed: 100, channelPointsWon: null },
    ])
  })
})
