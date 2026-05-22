import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'
import type { Players } from '../../../types'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

let rows: { userId: string | null }[] = []
let queriedIds: number[] | null = null

const supabase = {
  from: () => ({
    select: () => ({
      in: async (_column: string, ids: number[]) => {
        queriedIds = ids
        return { data: rows }
      },
    }),
  }),
}

mock.module('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase, logger: noopLogger }))

const { getStreamersInMatch } = await import('../getStreamersInMatch.ts')

const players = (accountIds: number[]): Players =>
  accountIds.map((accountid) => ({ heroid: undefined, accountid, playerid: null }))

describe('getStreamersInMatch', () => {
  beforeEach(() => {
    rows = []
    queriedIds = null
  })

  it('returns 0 when no other Dotabod users are in the match', async () => {
    rows = [{ userId: 'me' }]
    const count = await getStreamersInMatch({ players: players([1, 2, 3]), excludeUserId: 'me' })
    expect(count).toBe(0)
  })

  it('counts distinct other Dotabod users', async () => {
    rows = [{ userId: 'a' }, { userId: 'b' }]
    const count = await getStreamersInMatch({ players: players([1, 2, 3]), excludeUserId: 'me' })
    expect(count).toBe(2)
  })

  it('excludes the broadcaster even when their account is in the roster', async () => {
    rows = [{ userId: 'me' }, { userId: 'a' }]
    const count = await getStreamersInMatch({ players: players([1, 2]), excludeUserId: 'me' })
    expect(count).toBe(1)
  })

  it('counts a user with multiple linked accounts only once', async () => {
    rows = [{ userId: 'a' }, { userId: 'a' }, { userId: 'b' }]
    const count = await getStreamersInMatch({ players: players([1, 2, 3]), excludeUserId: 'me' })
    expect(count).toBe(2)
  })

  it('ignores null userIds returned by the join', async () => {
    rows = [{ userId: null }, { userId: 'a' }]
    const count = await getStreamersInMatch({ players: players([1, 2]), excludeUserId: 'me' })
    expect(count).toBe(1)
  })

  it('returns 0 without querying when there are no real account ids', async () => {
    const count = await getStreamersInMatch({ players: players([0, 0]), excludeUserId: 'me' })
    expect(count).toBe(0)
    expect(queriedIds).toBeNull()
  })

  it('only queries non-zero account ids', async () => {
    rows = [{ userId: 'a' }]
    await getStreamersInMatch({ players: players([0, 5, 0, 7]), excludeUserId: 'me' })
    expect(queriedIds).toEqual([5, 7])
  })
})
