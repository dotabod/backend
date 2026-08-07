// Regression tests for the inverted date subtraction in checkAltAccount: the
// diff used to be `creation - follow`, which is always <= 0 (an account must
// exist before it can follow), so the 0-10 day "alt" window almost never fired.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks'

const state: {
  creationDate: Date
  followDate: Date | null
  sayCalls: Array<{ channel: string; text: string; messageId?: string }>
} = {
  creationDate: new Date('2026-01-01T00:00:00Z'),
  followDate: new Date('2026-01-06T00:00:00Z'),
  sayCalls: [],
}

function reinstallMocks() {
  vi.doMock('@dotabod/shared-utils', () =>
    buildSharedUtilsMock({
      supabase: {},
      logger: {
        info: () => undefined,
        error: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
      },
      getTwitchAPI: async () => ({
        users: {
          getUserByName: async () => ({ creationDate: state.creationDate }),
        },
        channels: {
          getChannelFollowers: async () => ({
            data: state.followDate ? [{ followDate: state.followDate }] : [],
          }),
        },
      }),
    }),
  )

  vi.doMock('../chatClient', () => ({
    chatClient: {
      say: (channel: string, text: string, messageId?: string) => {
        state.sayCalls.push({ channel, text, messageId })
      },
      sayWithoutSuggestion: () => undefined,
      whisper: () => undefined,
    },
  }))
}
reinstallMocks()

await initTestI18n()

const { checkAltAccount } = await import('../checkAltAccount')

const client = { locale: 'en' } as any
const DAYS = 24 * 60 * 60 * 1000

beforeEach(() => {
  state.creationDate = new Date('2026-01-01T00:00:00Z')
  state.followDate = new Date('2026-01-06T00:00:00Z')
  state.sayCalls = []
  reinstallMocks()
})

describe('checkAltAccount', () => {
  it('flags a chatter whose account was created 5 days before following', async () => {
    // 5-day gap is inside the 0-10 day alt window. The inverted subtraction
    // computed -5 days here, so this user was never flagged.
    await checkAltAccount('chan', 'alt-user-5d', '40754777', { userId: 'u1' }, 'msg-1', client)
    expect(state.sayCalls).toHaveLength(1)
    expect(state.sayCalls[0].channel).toBe('chan')
  })

  it('flags an account created hours before following (same-day boundary)', async () => {
    state.followDate = new Date(state.creationDate.getTime() + 2 * 60 * 60 * 1000)
    await checkAltAccount('chan', 'alt-user-2h', '40754777', { userId: 'u2' }, 'msg-2', client)
    expect(state.sayCalls).toHaveLength(1)
  })

  it('flags an account created 9 days before following but not one created 10+ days before', async () => {
    state.followDate = new Date(state.creationDate.getTime() + 9 * DAYS)
    await checkAltAccount('chan', 'alt-user-9d', '40754777', { userId: 'u3' }, 'msg-3', client)
    expect(state.sayCalls).toHaveLength(1)

    state.followDate = new Date(state.creationDate.getTime() + 10 * DAYS)
    await checkAltAccount('chan', 'alt-user-10d', '40754777', { userId: 'u4' }, 'msg-4', client)
    expect(state.sayCalls).toHaveLength(1) // unchanged — 10 days is outside the window
  })

  it('does not flag a long-standing account created 30 days before following', async () => {
    state.followDate = new Date(state.creationDate.getTime() + 30 * DAYS)
    await checkAltAccount('chan', 'regular-user-30d', '40754777', { userId: 'u5' }, 'msg-5', client)
    expect(state.sayCalls).toHaveLength(0)
  })
})
