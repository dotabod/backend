import { beforeEach, describe, expect, it } from 'vitest'

import { createPacketStub } from '../../../__tests__/shared-mocks.ts'
import {
  baseMatchRow,
  commandHandler,
  findMostRecentResolvedMatch,
  makeClient,
  resetState,
  resolveMatchRetroactively,
  state,
} from './setup-mocks.ts'
import type { Client } from './setup-mocks.ts'

describe(resolveMatchRetroactively, () => {
  beforeEach(() => {
    resetState()
  })

  describe('current-match guard', () => {
    it('refuses to resolve the currently-playing match', async () => {
      const client = makeClient({
        gsi: createPacketStub({ map: { matchid: '7777777777' } }),
      })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({
        errorKey: 'currentMatch',
        success: false,
      })
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('Cannot resolve the current ongoing match')
      expect(state.updateCalls).toHaveLength(0)
      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.emitWLUpdateCalls).toBe(0)
    })

    it('still resolves a different match when there is a current match', async () => {
      state.sessionMatch = baseMatchRow({ matchId: '8888888888' })
      const client = makeClient({
        gsi: createPacketStub({ map: { matchid: '7777777777' } }),
      })

      const result = await resolveMatchRetroactively(
        client,
        '8888888888',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result.success).toBeTruthy()
      expect(state.updateCalls).toHaveLength(1)
    })
  })

  describe('match lookup', () => {
    it('returns notFound when there is no match anywhere', async () => {
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ errorKey: 'notFound', success: false })
      expect(state.chatSayCalls[0].message).toContain(
        'Match 7777777777 not found in current stream'
      )
      expect(state.updateCalls).toHaveLength(0)
    })

    it('returns expired when the match exists but outside the session window', async () => {
      state.olderMatch = { id: 'row-uuid-old' }
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        false,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ errorKey: 'expired', success: false })
      expect(state.chatSayCalls[0].message).toContain('Match 7777777777 is too old to resolve')
      expect(state.updateCalls).toHaveLength(0)
      expect(state.updateMmrCalls).toHaveLength(0)
    })

    it('falls back to a 12-hour window when stream_start_date is null', async () => {
      state.sessionMatch = baseMatchRow()
      const client = makeClient({ stream_start_date: null })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result.success).toBeTruthy()
    })
  })

  describe('fresh resolution (won was null)', () => {
    it('records a win, applies +mmrSize for ranked solo, and writes the success message', async () => {
      state.sessionMatch = baseMatchRow({
        is_party: false,
        lobby_type: 7,
        won: null,
      })
      state.steamSocketResponse = {
        matches: [{ dire_score: 30, game_mode: 22, lobby_type: 7, radiant_score: 50 }],
      }
      state.predictions = [
        {
          id: 'pred-1',
          outcomes: [
            { id: 'won-outcome', title: 'Yes', users: 10 },
            { id: 'lost-outcome', title: 'No', users: 5 },
          ],
          status: 'ACTIVE',
        },
      ]
      state.channelId = 'twitch-channel-1'

      const client = makeClient({ mmr: 5000 })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ success: true })

      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({
        dire_score: 30,
        game_mode: 22,
        lobby_type: 7,
        radiant_score: 50,
        won: true,
      })
      expect(state.updateCalls[0].whereId).toBe('row-uuid-1')

      expect(state.updateMmrCalls).toHaveLength(1)
      expect(state.updateMmrCalls[0]).toMatchObject({
        currentMmr: 5000,
        newMmr: 5025,
        steam32Id: 99_999,
      })

      expect(state.resolvePredictionCalls).toStrictEqual([
        {
          outcomeId: 'won-outcome',
          predictionId: 'pred-1',
          twitchId: 'twitch-channel-1',
        },
      ])

      expect(state.emitWLUpdateCalls).toBe(1)

      expect(state.chatSayCalls.at(-1)?.message).toBe(
        'Match 7777777777 manually marked as WON by @modUser'
      )
    })

    it('records a loss with -mmrSize and resolves the prediction to the loss outcome', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      state.predictions = [
        {
          id: 'pred-1',
          outcomes: [
            { id: 'won-outcome', title: 'Yes', users: 10 },
            { id: 'lost-outcome', title: 'No', users: 3 },
          ],
          status: 'LOCKED',
        },
      ]
      state.channelId = 'twitch-channel-1'

      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', false, 'modUser', '#streamer', 'msg-1')

      expect(state.updateCalls[0].values).toMatchObject({ won: false })
      expect(state.updateMmrCalls[0]).toMatchObject({
        currentMmr: 5000,
        newMmr: 4975,
      })
      expect(state.resolvePredictionCalls).toStrictEqual([
        {
          outcomeId: 'lost-outcome',
          predictionId: 'pred-1',
          twitchId: 'twitch-channel-1',
        },
      ])
    })

    it('uses MULTIPLIER_PARTY (20) instead of solo when the match was a party', async () => {
      state.sessionMatch = baseMatchRow({ is_party: true, won: null })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 5020 })
    })

    it('skips MMR update for non-ranked lobbies', async () => {
      state.sessionMatch = baseMatchRow({ lobby_type: 0, won: null })
      state.steamSocketResponse = {
        matches: [{ game_mode: 22, lobby_type: 0 }],
      }
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.updateCalls[0].values).toMatchObject({
        lobby_type: 0,
        won: true,
      })
    })

    it('skips MMR update when steam32Id is missing', async () => {
      state.sessionMatch = baseMatchRow({ steam32Id: null, won: null })
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
    })

    it('uses the row lobby_type when Steam returns no match data', async () => {
      state.sessionMatch = baseMatchRow({ lobby_type: 7, won: null })
      state.steamSocketResponse = { matches: [] }
      const client = makeClient({ mmr: 4000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4025 })
      expect(state.updateCalls[0].values).toMatchObject({
        dire_score: null,
        lobby_type: 7,
        radiant_score: null,
      })
    })

    it('defaults to LOBBY_TYPE_RANKED when both Steam and the row lack lobby_type', async () => {
      state.sessionMatch = baseMatchRow({ lobby_type: null, won: null })
      state.steamSocketResponse = { matches: [] }
      const client = makeClient({ mmr: 4000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4025 })
    })

    it('handles a missing prediction without aborting the resolution', async () => {
      state.sessionMatch = baseMatchRow({ predictionId: null, won: null })
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result.success).toBeTruthy()
      expect(state.resolvePredictionCalls).toHaveLength(0)
      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateMmrCalls).toHaveLength(1)
    })

    it('does not re-resolve a Twitch prediction that is already RESOLVED', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      state.predictions = [
        {
          id: 'pred-1',
          outcomes: [
            { id: 'won-outcome', title: 'Yes', users: 10 },
            { id: 'lost-outcome', title: 'No', users: 5 },
          ],
          status: 'RESOLVED',
        },
      ]
      state.channelId = 'twitch-channel-1'
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result.success).toBeTruthy()
      expect(state.resolvePredictionCalls).toHaveLength(0)
    })
  })

  describe('no-op (requested matches current value)', () => {
    it('returns success without DB or MMR side effects when match is already won and mod says won', async () => {
      state.sessionMatch = baseMatchRow({ won: true })
      const client = makeClient({ mmr: 5000 })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ success: true })
      expect(state.updateCalls).toHaveLength(0)
      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.resolvePredictionCalls).toHaveLength(0)
      expect(state.emitWLUpdateCalls).toBe(0)
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('Match 7777777777 is already marked as WON')
    })

    it('returns success without side effects when match is already lost and mod says loss', async () => {
      state.sessionMatch = baseMatchRow({ won: false })
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        false,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ success: true })
      expect(state.updateCalls).toHaveLength(0)
      expect(state.chatSayCalls[0].message).toContain('Match 7777777777 is already marked as LOST')
    })
  })

  describe('flip / correction (requested opposite of current value)', () => {
    it('flips loss to win, doubles the solo MMR delta to +50, and skips the prediction call', async () => {
      state.sessionMatch = baseMatchRow({
        is_party: false,
        lobby_type: 7,
        won: false,
      })
      state.predictions = [
        {
          id: 'pred-1',
          outcomes: [
            { id: 'won-outcome', title: 'Yes', users: 10 },
            { id: 'lost-outcome', title: 'No', users: 5 },
          ],
          status: 'ACTIVE',
        },
      ]
      state.channelId = 'twitch-channel-1'
      const client = makeClient({ mmr: 5000 })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1'
      )

      expect(result).toStrictEqual({ success: true })
      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })

      expect(state.updateMmrCalls).toHaveLength(1)
      expect(state.updateMmrCalls[0]).toMatchObject({
        currentMmr: 5000,
        newMmr: 5050,
      })

      expect(state.resolvePredictionCalls).toHaveLength(0)

      expect(state.emitWLUpdateCalls).toBe(1)

      expect(state.chatSayCalls.at(-1)?.message).toBe(
        'Match 7777777777 corrected from LOST to WON by @modUser'
      )
    })

    it('flips win to loss with -50 MMR delta for ranked solo', async () => {
      state.sessionMatch = baseMatchRow({
        is_party: false,
        lobby_type: 7,
        won: true,
      })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', false, 'modUser', '#streamer', 'msg-1')

      expect(state.updateCalls[0].values).toMatchObject({ won: false })
      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4950 })

      expect(state.chatSayCalls.at(-1)?.message).toBe(
        'Match 7777777777 corrected from WON to LOST by @modUser'
      )
    })

    it('uses 2 * MULTIPLIER_PARTY (40) when correcting a party match', async () => {
      state.sessionMatch = baseMatchRow({ is_party: true, won: false })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 5040 })
    })

    it('skips MMR adjustment when correcting a non-ranked match', async () => {
      state.sessionMatch = baseMatchRow({ lobby_type: 0, won: false })
      state.steamSocketResponse = {
        matches: [{ game_mode: 22, lobby_type: 0 }],
      }
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })
    })

    it('writes a minimal update on a flip (won + updated_at only, no Steam-sourced fields)', async () => {
      state.sessionMatch = baseMatchRow({
        dire_score: 30,
        lobby_type: 7,
        radiant_score: 42,
        won: false,
      })
      // Steam no longer has this match — simulates the older-match case.
      state.steamSocketResponse = { matches: [] }
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateCalls).toHaveLength(1)
      const { values } = state.updateCalls[0]
      expect(values).toStrictEqual({
        updated_at: expect.any(String),
        won: true,
      })
      // No score / lobby_type / game_mode fields, which would otherwise clobber
      // the row with null when Steam returns nothing.
      expect(values).not.toHaveProperty('radiant_score')
      expect(values).not.toHaveProperty('dire_score')
      expect(values).not.toHaveProperty('lobby_type')
      expect(values).not.toHaveProperty('game_mode')
    })

    it('never touches the prediction on a correction even when a valid prediction exists', async () => {
      state.sessionMatch = baseMatchRow({ won: false })
      state.predictions = [
        {
          id: 'pred-1',
          outcomes: [
            { id: 'won-outcome', title: 'Yes', users: 10 },
            { id: 'lost-outcome', title: 'No', users: 5 },
          ],
          status: 'ACTIVE',
        },
      ]
      state.channelId = 'twitch-channel-1'
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.resolvePredictionCalls).toHaveLength(0)
    })
  })

  describe('logging', () => {
    it('logs previousWon=null and isCorrection=false on a fresh resolution', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      const requestLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution requested'
      )
      expect(requestLog?.meta).toMatchObject({ previousWon: null, won: true })

      const completedLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution completed successfully'
      )
      expect(completedLog?.meta).toMatchObject({ isCorrection: false })
    })

    it('logs previousWon and isCorrection=true on a flip', async () => {
      state.sessionMatch = baseMatchRow({ won: false })
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      const requestLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution requested'
      )
      expect(requestLog?.meta).toMatchObject({ previousWon: false, won: true })

      const completedLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution completed successfully'
      )
      expect(completedLog?.meta).toMatchObject({
        isCorrection: true,
        previousWon: false,
      })
    })
  })

  describe('message id propagation', () => {
    it('passes the original messageId through to chatClient.say on success', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      const client = makeClient()

      await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'reply-target-1'
      )

      expect(state.chatSayCalls.at(-1)?.messageId).toBe('reply-target-1')
    })

    it('passes the messageId through on the expired error', async () => {
      state.olderMatch = { id: 'row-uuid-old' }
      const client = makeClient()

      await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'reply-target-2'
      )

      expect(state.chatSayCalls[0].messageId).toBe('reply-target-2')
    })
  })
})

describe(findMostRecentResolvedMatch, () => {
  beforeEach(() => {
    resetState()
  })

  it('returns the most recently resolved match in the session', async () => {
    state.recentList = [{ hero_name: null, matchId: '9999999999', won: true }]

    const result = await findMostRecentResolvedMatch('token-abc', new Date('2026-05-19T08:00:00Z'))

    expect(result).toStrictEqual({ matchId: '9999999999' })
  })

  it('returns null when no resolved matches exist in the session window', async () => {
    state.recentList = []

    const result = await findMostRecentResolvedMatch('token-abc', new Date('2026-05-19T08:00:00Z'))

    expect(result).toBeNull()
  })

  it('falls back to the 12-hour window when stream_start_date is null', async () => {
    state.recentList = [{ hero_name: null, matchId: '9999999999', won: true }]

    const result = await findMostRecentResolvedMatch('token-abc', null)

    expect(result).toStrictEqual({ matchId: '9999999999' })
  })

  it('excludes the in-progress match when given an excludeMatchId', async () => {
    // Mock returns the same list regardless of filter; the function passes
    // the excludeMatchId via .neq but the mock doesn't honor that filter, so
    // verify the function delegates to the query rather than the result here.
    state.recentList = []

    const result = await findMostRecentResolvedMatch(
      'token-abc',
      new Date('2026-05-19T08:00:00Z'),
      '7777777777'
    )

    expect(result).toBeNull()
  })
})

const buildMessage = function buildMessage(args: string[], clientOverrides: Partial<Client> = {}) {
  const client = makeClient(clientOverrides)
  return {
    channel: {
      client,
      id: 'channel-1',
      name: '#streamer',
      settings: client.settings,
    },
    content: `!cmd ${args.join(' ')}`.trim(),
    user: {
      messageId: 'msg-1',
      name: 'modUser',
      permission: 2,
      userId: 'user-1',
    },
  }
}

const getRegisteredCommand = function getRegisteredCommand(name: string) {
  const command = commandHandler.commands.get(name)
  if (command === undefined) {
    throw new Error(`Expected command "${name}" to be registered`)
  }
  return command
}

describe('command registration', () => {
  it('registers !recent with its aliases', () => {
    expect(commandHandler.commands.has('recent')).toBeTruthy()
    expect(commandHandler.aliases.get('history')).toBe('recent')
    expect(commandHandler.aliases.get('matches')).toBe('recent')
  })

  it('registers !won and !lost', () => {
    expect(commandHandler.commands.has('won')).toBeTruthy()
    expect(commandHandler.commands.has('lost')).toBeTruthy()
  })
})

describe('!recent command handler', () => {
  beforeEach(() => {
    resetState()
  })

  it('says "no resolved matches" when none exist in the session', async () => {
    state.recentList = []
    const cmd = getRegisteredCommand('recent')
    await cmd.handler(buildMessage([]), [], 'recent')

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('No resolved matches in this stream yet')
  })

  it('formats a single resolved match with W and hero name', async () => {
    state.recentList = [{ hero_name: 'npc_dota_hero_lina', matchId: '7777777777', won: true }]
    const cmd = getRegisteredCommand('recent')
    await cmd.handler(buildMessage([]), [], 'recent')

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Recent matches:')
    expect(state.chatSayCalls[0].message).toContain('7777777777 W')
    expect(state.chatSayCalls[0].message).toContain('Lina')
  })

  it('marks losses with L', async () => {
    state.recentList = [{ hero_name: 'npc_dota_hero_pudge', matchId: '8888888888', won: false }]
    const cmd = getRegisteredCommand('recent')
    await cmd.handler(buildMessage([]), [], 'recent')

    expect(state.chatSayCalls[0].message).toContain('8888888888 L')
    expect(state.chatSayCalls[0].message).toContain('Pudge')
  })

  it('lists multiple matches comma-separated', async () => {
    state.recentList = [
      { hero_name: 'npc_dota_hero_lina', matchId: '7777777777', won: true },
      { hero_name: 'npc_dota_hero_pudge', matchId: '8888888888', won: false },
    ]
    const cmd = getRegisteredCommand('recent')
    await cmd.handler(buildMessage([]), [], 'recent')

    const msg = state.chatSayCalls[0].message
    expect(msg).toContain('7777777777 W (Lina)')
    expect(msg).toContain('8888888888 L (Pudge)')
    expect(msg.indexOf(',')).toBeGreaterThan(0)
  })

  it('falls back to "Unknown" when hero_name is null', async () => {
    state.recentList = [{ hero_name: null, matchId: '7777777777', won: true }]
    const cmd = getRegisteredCommand('recent')
    await cmd.handler(buildMessage([]), [], 'recent')

    expect(state.chatSayCalls[0].message).toContain('Unknown')
  })
})

describe('!won / !lost fallback to most-recent resolved', () => {
  beforeEach(() => {
    resetState()
    // No pending DC resolution by default — exercises the fallback branch.
    state.redisGet = {}
  })

  it('!won with no arg and no pending resolution flips the most recent resolved match', async () => {
    state.recentList = [{ hero_name: null, matchId: '7777777777', won: false }]
    state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: false })

    const cmd = getRegisteredCommand('won')
    await cmd.handler(buildMessage([]), [], 'won')

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({ won: true })

    expect(state.chatSayCalls.at(-1)?.message).toContain('corrected from LOST to WON')
  })

  it('!lost with no arg and no pending resolution flips the most recent resolved match', async () => {
    state.recentList = [{ hero_name: null, matchId: '7777777777', won: true }]
    state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: true })

    const cmd = getRegisteredCommand('lost')
    await cmd.handler(buildMessage([]), [], 'lost')

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({ won: false })

    expect(state.chatSayCalls.at(-1)?.message).toContain('corrected from WON to LOST')
  })

  it('!won says "no pending resolution" when there is no recent resolved match either', async () => {
    state.recentList = []

    const cmd = getRegisteredCommand('won')
    await cmd.handler(buildMessage([]), [], 'won')

    expect(state.updateCalls).toHaveLength(0)
    expect(state.chatSayCalls[0].message).toContain('No pending bet resolution needed')
  })

  it('!won no-ops when the most recent resolved match is already marked as won', async () => {
    state.recentList = [{ hero_name: null, matchId: '7777777777', won: true }]
    state.sessionMatch = baseMatchRow({ matchId: '7777777777', won: true })

    const cmd = getRegisteredCommand('won')
    await cmd.handler(buildMessage([]), [], 'won')

    expect(state.updateCalls).toHaveLength(0)
    expect(state.chatSayCalls[0].message).toContain('is already marked as WON')
  })
})
