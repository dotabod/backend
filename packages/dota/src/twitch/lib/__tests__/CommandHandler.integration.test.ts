import { beforeEach, describe, expect, it } from 'bun:test'
import {
  baseMatchRow,
  type Client,
  commandHandler,
  makeClient,
  resetState,
  state,
} from './setupMocks.ts'

// End-to-end integration tests that exercise `commandHandler.handleMessage()`:
//   parsing → alias resolution → settings/subscription gate → permission check
//   → cooldown → handler dispatch.
// These complement the unit tests in resolveMatch.test.ts (which call handlers
// directly) by proving the wiring works for real chat input strings.

function makeMessage({
  content,
  permission,
  channelId = 'channel-1',
  userName = 'modUser',
  clientOverrides = {},
}: {
  content: string
  permission: number
  channelId?: string
  userName?: string
  clientOverrides?: Partial<Client>
}) {
  // A Pro subscription bypasses the subscription gate in `canAccessFeature`
  // so the integration tests can focus on dispatch + permission behavior.
  const client = makeClient({
    subscription: {
      id: 'sub-1',
      tier: 'PRO',
      status: 'ACTIVE',
      isGift: false,
    } as any,
    ...clientOverrides,
  })
  return {
    user: { name: userName, messageId: 'msg-1', permission, userId: 'user-1' },
    content,
    channel: {
      name: '#streamer',
      id: channelId,
      client,
      settings: client.settings,
    },
  }
}

describe('CommandHandler dispatch (integration)', () => {
  beforeEach(() => {
    resetState()
    // The handler's cooldown map persists across tests in the same process.
    // Clear it so each test starts with a fresh cooldown ledger.
    commandHandler.cooldowns.clear()
  })

  describe('parsing', () => {
    it('dispatches !recent and the handler emits chat output', async () => {
      state.recentList = [{ matchId: '7777777777', hero_name: 'npc_dota_hero_lina', won: true }]
      await commandHandler.handleMessage(makeMessage({ content: '!recent', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('Recent matches:')
      expect(state.chatSayCalls[0].message).toContain('7777777777 W')
    })

    it('parses arguments and forwards them to the handler', async () => {
      // !won with an explicit matchId routes to resolveMatchRetroactively.
      // The harness's session-match mock returns a resolved row, so this
      // exercises the args extraction + dispatch path end-to-end.
      state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: false })

      await commandHandler.handleMessage(makeMessage({ content: '!won 7777777777', permission: 2 }))

      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })
    })

    it('silently ignores unregistered commands', async () => {
      await commandHandler.handleMessage(
        makeMessage({ content: '!totally_not_a_command', permission: 2 }),
      )

      expect(state.chatSayCalls).toHaveLength(0)
    })

    it('silently ignores non-command messages', async () => {
      await commandHandler.handleMessage(makeMessage({ content: 'just chatting', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(0)
    })
  })

  describe('alias resolution', () => {
    it('routes !history to the !recent handler', async () => {
      state.recentList = []
      await commandHandler.handleMessage(makeMessage({ content: '!history', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('No resolved matches in this stream yet')
    })

    it('routes !matches to the !recent handler', async () => {
      state.recentList = []
      await commandHandler.handleMessage(makeMessage({ content: '!matches', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('No resolved matches in this stream yet')
    })
  })

  describe('permission gating', () => {
    it('blocks viewers (permission=0) from running !recent', async () => {
      state.recentList = [{ matchId: '7777777777', hero_name: 'npc_dota_hero_lina', won: true }]

      await commandHandler.handleMessage(
        makeMessage({ content: '!recent', permission: 0, userName: 'someViewer' }),
      )

      expect(state.chatSayCalls).toHaveLength(0)
    })

    it('blocks subscribers (permission=1) from running !won', async () => {
      await commandHandler.handleMessage(
        makeMessage({ content: '!won', permission: 1, userName: 'someSub' }),
      )

      expect(state.chatSayCalls).toHaveLength(0)
      expect(state.updateCalls).toHaveLength(0)
    })

    it('allows mods (permission=2) to run !recent', async () => {
      state.recentList = []
      await commandHandler.handleMessage(makeMessage({ content: '!recent', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(1)
    })

    it('allows broadcaster (permission=3) to run !lost', async () => {
      await commandHandler.handleMessage(
        makeMessage({ content: '!lost', permission: 3, userName: 'broadcaster' }),
      )

      // The broadcaster has no recent resolved match in the harness, so the
      // fallback misses and the command says "no pending resolution". The
      // important thing is that the handler RAN — we got chat output.
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('No pending bet resolution needed')
    })
  })

  describe('!won / !lost end-to-end via handleMessage', () => {
    it('!lost with no arg and no pending resolution flips the most-recent resolved match', async () => {
      state.recentMatch = { matchId: '7777777777' }
      state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: true })

      await commandHandler.handleMessage(makeMessage({ content: '!lost', permission: 2 }))

      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({ won: false })
      expect(state.chatSayCalls[state.chatSayCalls.length - 1].message).toContain(
        'corrected from WON to LOST',
      )
    })

    it('!won with a matchId arg routes through the retroactive path', async () => {
      state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: null })

      await commandHandler.handleMessage(makeMessage({ content: '!won 7777777777', permission: 2 }))

      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })
    })

    it('rejects a non-numeric matchId arg with the not-found message', async () => {
      await commandHandler.handleMessage(makeMessage({ content: '!won notanumber', permission: 2 }))

      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('not found in current stream')
      expect(state.updateCalls).toHaveLength(0)
    })
  })
})
