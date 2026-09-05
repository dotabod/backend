// Exercises the real updateMmr() against a minimal hand-rolled supabase mock
// (not the twitch/lib/__tests__/setupMocks.ts harness, which vi.doMock's this
// exact module away — importing it here would replace the code under test).
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'
import type { SocketClient } from '../../../types'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const mockState: {
  foundToken: string | null
  steamAccountsUpdateCalls: { values: Record<string, unknown>; steam32Id: unknown }[]
  usersUpdateCalls: { values: Record<string, unknown>; id: unknown }[]
} = { foundToken: 'token-abc', steamAccountsUpdateCalls: [], usersUpdateCalls: [] }

const supabaseMock = {
  from: (table: string) => {
    if (table === 'steam_accounts') {
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (_col: string, steam32Id: unknown) => {
            mockState.steamAccountsUpdateCalls.push({ steam32Id, values })
            return {
              select: async () => ({
                data: mockState.foundToken ? [{ userId: mockState.foundToken }] : [],
                error: null,
              }),
            }
          },
        }),
      }
    }
    if (table === 'users') {
      return {
        update: (values: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            mockState.usersUpdateCalls.push({ id, values })
            return { data: null, error: null }
          },
        }),
      }
    }
    throw new Error(`updateMmr.test.ts: unexpected table "${table}"`)
  },
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: supabaseMock })
)

const { updateMmr } = await import('../updateMmr.ts')
const { gsiHandlers } = await import('../consts.ts')

function makeClient(overrides: Partial<SocketClient> = {}): SocketClient {
  return {
    Account: null,
    SteamAccount: [{ leaderboard_rank: null, mmr: 5000, name: 'streamer', steam32Id: 99_999 }],
    beta_tester: false,
    locale: 'en',
    mmr: 5000,
    name: 'streamer',
    settings: [],
    steam32Id: 99_999,
    stream_online: true,
    stream_start_date: null,
    token: 'token-abc',
    ...overrides,
  }
}

describe('updateMmr (steam32Id branch)', () => {
  beforeEach(() => {
    mockState.foundToken = 'token-abc'
    mockState.steamAccountsUpdateCalls = []
    mockState.usersUpdateCalls = []
    gsiHandlers.clear()
  })

  it('syncs the in-memory client.mmr immediately after a successful update', async () => {
    const client = makeClient({ mmr: 5000, steam32Id: 99_999 })
    gsiHandlers.set('token-abc', { client } as any)

    await updateMmr({
      channel: '#streamer',
      currentMmr: 5000,
      newMmr: 5025,
      steam32Id: 99_999,
    })

    expect(client.mmr).toBe(5025)
    expect(client.SteamAccount[0].mmr).toBe(5025)
  })

  it('does not lose an update when two corrections land back-to-back, each reading the live client.mmr', async () => {
    const client = makeClient({ mmr: 5000, steam32Id: 99_999 })
    gsiHandlers.set('token-abc', { client } as any)

    // Mirrors real call sites: currentMmr is read from the live client, and
    // the new value is currentMmr + delta. Before the fix, client.mmr never
    // advanced past 5000, so both calls computed newMmr = 5025 and the
    // second write silently clobbered the first.
    await updateMmr({
      channel: '#streamer',
      currentMmr: client.mmr,
      newMmr: client.mmr + 25,
      steam32Id: 99_999,
    })
    await updateMmr({
      channel: '#streamer',
      currentMmr: client.mmr,
      newMmr: client.mmr + 25,
      steam32Id: 99_999,
    })

    expect(client.mmr).toBe(5050)
    expect(mockState.steamAccountsUpdateCalls.map((c) => c.values.mmr)).toStrictEqual([5025, 5050])
  })

  it('only updates client.mmr when the account being updated is the currently-active one', async () => {
    const client = makeClient({ mmr: 5000, steam32Id: 11_111 })
    client.SteamAccount = [
      { leaderboard_rank: null, mmr: 5000, name: 'main', steam32Id: 11_111 },
      { leaderboard_rank: null, mmr: 3000, name: 'smurf', steam32Id: 99_999 },
    ]
    gsiHandlers.set('token-abc', { client } as any)

    await updateMmr({
      channel: '#streamer',
      currentMmr: 3000,
      newMmr: 3025,
      steam32Id: 99_999, // updating the smurf, not the active account,
    })

    expect(client.mmr).toBe(5000) // unchanged — active account is still 11111
    expect(client.SteamAccount[1].mmr).toBe(3025) // the smurf entry is updated
  })
})
