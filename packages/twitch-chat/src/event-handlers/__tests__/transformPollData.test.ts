import { describe, expect, it } from 'vite-plus/test'
import { transformPollData } from '../transformPollData.ts'

describe('transformPollData', () => {
  it('maps choice votes from the EventSub `votes` field (progress event)', () => {
    const result = transformPollData({
      id: 'poll-1',
      title: 'Play Forza SIM',
      started_at: '2026-05-25T00:00:00.000Z',
      ends_at: '2026-05-25T00:05:00.000Z',
      choices: [
        { id: 'a', title: 'Yes', votes: 42, channel_points_votes: 10, bits_votes: 0 },
        { id: 'b', title: 'No', votes: 7, channel_points_votes: 0, bits_votes: 0 },
      ],
    })

    expect(result).toEqual({
      title: 'Play Forza SIM',
      endDate: new Date('2026-05-25T00:05:00.000Z'),
      choices: [
        { title: 'Yes', totalVotes: 42 },
        { title: 'No', totalVotes: 7 },
      ],
    })
  })

  it('uses `ended_at` for the end event', () => {
    const result = transformPollData({
      id: 'poll-1',
      title: 'p',
      started_at: '2026-05-25T00:00:00.000Z',
      ended_at: '2026-05-25T00:05:00.000Z',
      choices: [{ id: 'a', title: 'A', votes: 3, channel_points_votes: 0, bits_votes: 0 }],
    })

    expect(result.endDate).toEqual(new Date('2026-05-25T00:05:00.000Z'))
    expect(result.choices).toEqual([{ title: 'A', totalVotes: 3 }])
  })

  it('defaults totalVotes to 0 when votes is absent (begin event before any votes)', () => {
    const result = transformPollData({
      id: 'poll-1',
      title: 'p',
      choices: [{ id: 'a', title: 'A' }],
    })
    expect(result.choices).toEqual([{ title: 'A', totalVotes: 0 }])
  })

  it('uses empty string endDate when neither ends_at nor ended_at is present', () => {
    const result = transformPollData({ id: 'poll-1', title: 'p', choices: [] })
    expect(result.endDate).toBe('')
  })
})
