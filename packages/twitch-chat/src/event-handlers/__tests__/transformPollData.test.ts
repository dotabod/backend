import { describe, expect, it } from 'vitest'

import { transformPollData } from '../transformPollData.ts'

describe(transformPollData, () => {
  it('maps choice votes from the EventSub `votes` field (progress event)', () => {
    const result = transformPollData({
      choices: [
        { id: 'a', title: 'Yes', votes: 42, channel_points_votes: 10, bits_votes: 0 },
        { id: 'b', title: 'No', votes: 7, channel_points_votes: 0, bits_votes: 0 },
      ],
      ends_at: '2026-05-25T00:05:00.000Z',
      id: 'poll-1',
      started_at: '2026-05-25T00:00:00.000Z',
      title: 'Play Forza SIM',
    })

    expect(result).toStrictEqual({
      choices: [
        { title: 'Yes', totalVotes: 42 },
        { title: 'No', totalVotes: 7 },
      ],
      endDate: new Date('2026-05-25T00:05:00.000Z'),
      title: 'Play Forza SIM',
    })
  })

  it('uses `ended_at` for the end event', () => {
    const result = transformPollData({
      choices: [{ id: 'a', title: 'A', votes: 3, channel_points_votes: 0, bits_votes: 0 }],
      ended_at: '2026-05-25T00:05:00.000Z',
      id: 'poll-1',
      started_at: '2026-05-25T00:00:00.000Z',
      title: 'p',
    })

    expect(result.endDate).toStrictEqual(new Date('2026-05-25T00:05:00.000Z'))
    expect(result.choices).toStrictEqual([{ title: 'A', totalVotes: 3 }])
  })

  it('defaults totalVotes to 0 when votes is absent (begin event before any votes)', () => {
    const result = transformPollData({
      choices: [{ id: 'a', title: 'A' }],
      id: 'poll-1',
      title: 'p',
    })
    expect(result.choices).toStrictEqual([{ title: 'A', totalVotes: 0 }])
  })

  it('uses empty string endDate when neither ends_at nor ended_at is present', () => {
    const result = transformPollData({ choices: [], id: 'poll-1', title: 'p' })
    expect(result.endDate).toBe('')
  })
})
