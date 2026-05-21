import { describe, expect, it } from 'bun:test'
import { transformPollData } from '../transformPollData.ts'

describe('transformPollData', () => {
  it('maps title and choices, converting end_date to a Date', () => {
    const result = transformPollData({
      title: 'Favorite hero?',
      end_date: '2026-05-20T00:00:00.000Z',
      choices: [
        { title: 'Pudge', total_votes: 10 },
        { title: 'Invoker', total_votes: 5 },
      ],
    })

    expect(result).toEqual({
      title: 'Favorite hero?',
      endDate: new Date('2026-05-20T00:00:00.000Z'),
      choices: [
        { title: 'Pudge', totalVotes: 10 },
        { title: 'Invoker', totalVotes: 5 },
      ],
    })
  })

  it('defaults totalVotes to 0 when total_votes is absent', () => {
    const result = transformPollData({ title: 'p', choices: [{ title: 'A' }] })
    expect(result.choices).toEqual([{ title: 'A', totalVotes: 0 }])
  })

  it('uses empty string endDate when end_date is absent', () => {
    const result = transformPollData({ title: 'p', choices: [] })
    expect(result.endDate).toBe('')
  })
})
