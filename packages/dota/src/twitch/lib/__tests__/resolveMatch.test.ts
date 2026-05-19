import { beforeEach, describe, expect, it, mock } from 'bun:test'

// Shared mutable state that every mock reads from. Reset in beforeEach.
type SessionMatchRow = {
  id: string
  matchId: string
  myTeam: string
  predictionId: string | null
  steam32Id: number | null
  lobby_type: number | null
  is_party: boolean | null
  won: boolean | null
}

type Prediction = {
  id: string
  status: 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED'
  outcomes: { id: string; users: number; title: string }[]
}

const state: {
  sessionMatch: SessionMatchRow | null
  olderMatch: { id: string } | null
  updateCalls: Array<{ values: Record<string, unknown>; whereId: string | null }>
  updateMmrCalls: Array<Record<string, unknown>>
  chatSayCalls: Array<{ channel: string; message: string; messageId?: string }>
  steamSocketResponse: { matches: unknown[] } | null
  steamSocketError: unknown
  predictions: Prediction[]
  resolvePredictionCalls: Array<{ twitchId: string; predictionId: string; outcomeId: string }>
  emitWLUpdateCalls: number
  channelId: string | null
  loggerInfoCalls: Array<{ message: string; meta: Record<string, unknown> }>
} = {
  sessionMatch: null,
  olderMatch: null,
  updateCalls: [],
  updateMmrCalls: [],
  chatSayCalls: [],
  steamSocketResponse: null,
  steamSocketError: null,
  predictions: [],
  resolvePredictionCalls: [],
  emitWLUpdateCalls: 0,
  channelId: null,
  loggerInfoCalls: [],
}

function resetState() {
  state.sessionMatch = null
  state.olderMatch = null
  state.updateCalls = []
  state.updateMmrCalls = []
  state.chatSayCalls = []
  state.steamSocketResponse = null
  state.steamSocketError = null
  state.predictions = []
  state.resolvePredictionCalls = []
  state.emitWLUpdateCalls = 0
  state.channelId = null
  state.loggerInfoCalls = []
}

// Supabase chainable mock. The session-window query uses .gte while the
// fallback older-match query does not, so we branch on that to return the
// appropriate canned result.
function createSupabaseFromBuilder() {
  let hasGte = false
  let mode: 'select' | 'update' | null = null
  let updateValues: Record<string, unknown> = {}
  let updateWhereId: string | null = null

  const builder: any = {
    select: () => {
      mode = 'select'
      return builder
    },
    update: (values: Record<string, unknown>) => {
      mode = 'update'
      updateValues = values
      return builder
    },
    eq: (col: string, val: string) => {
      if (mode === 'update' && col === 'id') {
        updateWhereId = val
        state.updateCalls.push({ values: updateValues, whereId: updateWhereId })
        return Promise.resolve({ data: null, error: null })
      }
      return builder
    },
    gte: () => {
      hasGte = true
      return builder
    },
    is: () => builder,
    single: async () => {
      if (hasGte) {
        return state.sessionMatch
          ? { data: state.sessionMatch, error: null }
          : { data: null, error: { message: 'not found' } }
      }
      return state.olderMatch
        ? { data: state.olderMatch, error: null }
        : { data: null, error: { message: 'not found' } }
    },
  }

  return builder
}

const supabaseMock = {
  from: () => createSupabaseFromBuilder(),
}

const loggerMock = {
  info: (message: string, meta?: Record<string, unknown>) => {
    state.loggerInfoCalls.push({ message, meta: meta ?? {} })
  },
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

const getTwitchAPIMock = async () => ({
  predictions: {
    getPredictions: async () => ({ data: state.predictions }),
    resolvePrediction: async (twitchId: string, predictionId: string, outcomeId: string) => {
      state.resolvePredictionCalls.push({ twitchId, predictionId, outcomeId })
      return {}
    },
  },
})

// `@dotabod/shared-utils` has a wide surface (some of it imported transitively
// by chatClient and friends), so the mock needs to cover everything that any
// importer in the graph asks for at runtime. Types are erased so they aren't
// listed.
mock.module('@dotabod/shared-utils', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getSupabaseClient: () => supabaseMock,
  logger: loggerMock,
  getTwitchAPI: getTwitchAPIMock,
  getAuthProvider: () => ({}),
  getTwitchHeaders: () => ({}),
  getTwitchTokens: async () => ({ access_token: '', refresh_token: '' }),
  hasTokens: () => true,
  botStatus: { isBanned: false },
  checkBotStatus: async () => false,
  fetchConduitId: async () => '',
  updateConduitShard: async () => undefined,
  trackDisableReason: async () => undefined,
  trackResolveReason: async () => undefined,
}))

mock.module('../../../dota/lib/updateMmr.js', () => ({
  updateMmr: async (args: Record<string, unknown>) => {
    state.updateMmrCalls.push(args)
  },
  tellChatNewMMR: () => undefined,
}))

// Use the real i18next with the actual English translation file so the test
// asserts on the strings that will land in chat. Avoids mocking i18next, which
// would leak into other test files since `mock.module()` is process-wide.
const i18next = (await import('i18next')).default
const enTranslation = (await import('../../../../locales/en/translation.json')).default
await i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: enTranslation } },
})

// Import after all module mocks are registered.
const { resolveMatchRetroactively } = await import('../resolveMatch.js')
const { gsiHandlers } = await import('../../../dota/lib/consts.js')
const { steamSocket } = await import('../../../steam/ws.js')
const { chatClient } = await import('../../chatClient.js')

// Monkey-patch the singletons we need behavior control over. Mocking these
// modules wholesale would force us to enumerate every other transitive export.
steamSocket.emit = ((
  _event: string,
  _args: unknown,
  cb: (err: unknown, response: unknown) => void,
) => {
  if (state.steamSocketError) {
    cb(state.steamSocketError, null)
    return
  }
  cb(null, state.steamSocketResponse ?? { matches: [] })
}) as any

chatClient.say = (async (channel: string, message: string, messageId?: string) => {
  state.chatSayCalls.push({ channel, message, messageId })
}) as any

const fakeGsiHandler = {
  getChannelId: () => state.channelId,
  emitWLUpdate: () => {
    state.emitWLUpdateCalls += 1
  },
} as any
gsiHandlers.set('token-abc', fakeGsiHandler)

type Client = Parameters<typeof resolveMatchRetroactively>[0]

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    name: 'streamer',
    token: 'token-abc',
    stream_online: true,
    stream_start_date: new Date('2026-05-19T08:00:00Z'),
    beta_tester: false,
    locale: 'en',
    steam32Id: 99999,
    mmr: 5000,
    Account: {
      requires_refresh: false,
      refresh_token: '',
      access_token: '',
      expires_at: null,
      scope: null,
      obtainment_timestamp: null,
      expires_in: null,
      providerAccountId: 'twitch-channel-1',
    },
    SteamAccount: [],
    settings: [],
    gsi: undefined,
    ...overrides,
  } as Client
}

const baseMatchRow = (overrides: Partial<SessionMatchRow> = {}): SessionMatchRow => ({
  id: 'row-uuid-1',
  matchId: '7777777777',
  myTeam: 'radiant',
  predictionId: 'pred-1',
  steam32Id: 99999,
  lobby_type: 7,
  is_party: false,
  won: null,
  ...overrides,
})

describe('resolveMatchRetroactively', () => {
  beforeEach(() => {
    resetState()
  })

  describe('current-match guard', () => {
    it('refuses to resolve the currently-playing match', async () => {
      const client = makeClient({
        gsi: { map: { matchid: '7777777777' } } as any,
      })

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1',
      )

      expect(result).toEqual({ success: false, errorKey: 'currentMatch' })
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('Cannot resolve the current ongoing match')
      expect(state.updateCalls).toHaveLength(0)
      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.emitWLUpdateCalls).toBe(0)
    })

    it('still resolves a different match when there is a current match', async () => {
      state.sessionMatch = baseMatchRow({ matchId: '8888888888' })
      const client = makeClient({ gsi: { map: { matchid: '7777777777' } } as any })

      const result = await resolveMatchRetroactively(
        client,
        '8888888888',
        true,
        'modUser',
        '#streamer',
        'msg-1',
      )

      expect(result.success).toBe(true)
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
        'msg-1',
      )

      expect(result).toEqual({ success: false, errorKey: 'notFound' })
      expect(state.chatSayCalls[0].message).toContain(
        'Match 7777777777 not found in current stream',
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
        'msg-1',
      )

      expect(result).toEqual({ success: false, errorKey: 'expired' })
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
        'msg-1',
      )

      expect(result.success).toBe(true)
    })
  })

  describe('fresh resolution (won was null)', () => {
    it('records a win, applies +mmrSize for ranked solo, and writes the success message', async () => {
      state.sessionMatch = baseMatchRow({ won: null, is_party: false, lobby_type: 7 })
      state.steamSocketResponse = {
        matches: [{ lobby_type: 7, game_mode: 22, radiant_score: 50, dire_score: 30 }],
      }
      state.predictions = [
        {
          id: 'pred-1',
          status: 'ACTIVE',
          outcomes: [
            { id: 'won-outcome', users: 10, title: 'Yes' },
            { id: 'lost-outcome', users: 5, title: 'No' },
          ],
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
        'msg-1',
      )

      expect(result).toEqual({ success: true })

      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({
        won: true,
        lobby_type: 7,
        game_mode: 22,
        radiant_score: 50,
        dire_score: 30,
      })
      expect(state.updateCalls[0].whereId).toBe('row-uuid-1')

      expect(state.updateMmrCalls).toHaveLength(1)
      expect(state.updateMmrCalls[0]).toMatchObject({
        currentMmr: 5000,
        newMmr: 5025,
        steam32Id: 99999,
      })

      expect(state.resolvePredictionCalls).toEqual([
        { twitchId: 'twitch-channel-1', predictionId: 'pred-1', outcomeId: 'won-outcome' },
      ])

      expect(state.emitWLUpdateCalls).toBe(1)

      const finalSay = state.chatSayCalls[state.chatSayCalls.length - 1]
      expect(finalSay.message).toBe('Match 7777777777 manually marked as WON by @modUser')
    })

    it('records a loss with -mmrSize and resolves the prediction to the loss outcome', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      state.predictions = [
        {
          id: 'pred-1',
          status: 'LOCKED',
          outcomes: [
            { id: 'won-outcome', users: 10, title: 'Yes' },
            { id: 'lost-outcome', users: 3, title: 'No' },
          ],
        },
      ]
      state.channelId = 'twitch-channel-1'

      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', false, 'modUser', '#streamer', 'msg-1')

      expect(state.updateCalls[0].values).toMatchObject({ won: false })
      expect(state.updateMmrCalls[0]).toMatchObject({ currentMmr: 5000, newMmr: 4975 })
      expect(state.resolvePredictionCalls).toEqual([
        { twitchId: 'twitch-channel-1', predictionId: 'pred-1', outcomeId: 'lost-outcome' },
      ])
    })

    it('uses MULTIPLIER_PARTY (20) instead of solo when the match was a party', async () => {
      state.sessionMatch = baseMatchRow({ won: null, is_party: true })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 5020 })
    })

    it('skips MMR update for non-ranked lobbies', async () => {
      state.sessionMatch = baseMatchRow({ won: null, lobby_type: 0 })
      state.steamSocketResponse = { matches: [{ lobby_type: 0, game_mode: 22 }] }
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.updateCalls[0].values).toMatchObject({ won: true, lobby_type: 0 })
    })

    it('skips MMR update when steam32Id is missing', async () => {
      state.sessionMatch = baseMatchRow({ won: null, steam32Id: null })
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
    })

    it('uses the row lobby_type when Steam returns no match data', async () => {
      state.sessionMatch = baseMatchRow({ won: null, lobby_type: 7 })
      state.steamSocketResponse = { matches: [] }
      const client = makeClient({ mmr: 4000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4025 })
      expect(state.updateCalls[0].values).toMatchObject({
        lobby_type: 7,
        radiant_score: null,
        dire_score: null,
      })
    })

    it('defaults to LOBBY_TYPE_RANKED when both Steam and the row lack lobby_type', async () => {
      state.sessionMatch = baseMatchRow({ won: null, lobby_type: null })
      state.steamSocketResponse = { matches: [] }
      const client = makeClient({ mmr: 4000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4025 })
    })

    it('handles a missing prediction without aborting the resolution', async () => {
      state.sessionMatch = baseMatchRow({ won: null, predictionId: null })
      const client = makeClient()

      const result = await resolveMatchRetroactively(
        client,
        '7777777777',
        true,
        'modUser',
        '#streamer',
        'msg-1',
      )

      expect(result.success).toBe(true)
      expect(state.resolvePredictionCalls).toHaveLength(0)
      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateMmrCalls).toHaveLength(1)
    })

    it('does not re-resolve a Twitch prediction that is already RESOLVED', async () => {
      state.sessionMatch = baseMatchRow({ won: null })
      state.predictions = [
        {
          id: 'pred-1',
          status: 'RESOLVED',
          outcomes: [
            { id: 'won-outcome', users: 10, title: 'Yes' },
            { id: 'lost-outcome', users: 5, title: 'No' },
          ],
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
        'msg-1',
      )

      expect(result.success).toBe(true)
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
        'msg-1',
      )

      expect(result).toEqual({ success: true })
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
        'msg-1',
      )

      expect(result).toEqual({ success: true })
      expect(state.updateCalls).toHaveLength(0)
      expect(state.chatSayCalls[0].message).toContain('Match 7777777777 is already marked as LOST')
    })
  })

  describe('flip / correction (requested opposite of current value)', () => {
    it('flips loss to win, doubles the solo MMR delta to +50, and skips the prediction call', async () => {
      state.sessionMatch = baseMatchRow({ won: false, is_party: false, lobby_type: 7 })
      state.predictions = [
        {
          id: 'pred-1',
          status: 'ACTIVE',
          outcomes: [
            { id: 'won-outcome', users: 10, title: 'Yes' },
            { id: 'lost-outcome', users: 5, title: 'No' },
          ],
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
        'msg-1',
      )

      expect(result).toEqual({ success: true })
      expect(state.updateCalls).toHaveLength(1)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })

      expect(state.updateMmrCalls).toHaveLength(1)
      expect(state.updateMmrCalls[0]).toMatchObject({ currentMmr: 5000, newMmr: 5050 })

      expect(state.resolvePredictionCalls).toHaveLength(0)

      expect(state.emitWLUpdateCalls).toBe(1)

      const finalSay = state.chatSayCalls[state.chatSayCalls.length - 1]
      expect(finalSay.message).toBe('Match 7777777777 corrected from LOST to WON by @modUser')
    })

    it('flips win to loss with -50 MMR delta for ranked solo', async () => {
      state.sessionMatch = baseMatchRow({ won: true, is_party: false, lobby_type: 7 })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', false, 'modUser', '#streamer', 'msg-1')

      expect(state.updateCalls[0].values).toMatchObject({ won: false })
      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 4950 })

      const finalSay = state.chatSayCalls[state.chatSayCalls.length - 1]
      expect(finalSay.message).toBe('Match 7777777777 corrected from WON to LOST by @modUser')
    })

    it('uses 2 * MULTIPLIER_PARTY (40) when correcting a party match', async () => {
      state.sessionMatch = baseMatchRow({ won: false, is_party: true })
      const client = makeClient({ mmr: 5000 })

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls[0]).toMatchObject({ newMmr: 5040 })
    })

    it('skips MMR adjustment when correcting a non-ranked match', async () => {
      state.sessionMatch = baseMatchRow({ won: false, lobby_type: 0 })
      state.steamSocketResponse = { matches: [{ lobby_type: 0, game_mode: 22 }] }
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      expect(state.updateMmrCalls).toHaveLength(0)
      expect(state.updateCalls[0].values).toMatchObject({ won: true })
    })

    it('never touches the prediction on a correction even when a valid prediction exists', async () => {
      state.sessionMatch = baseMatchRow({ won: false })
      state.predictions = [
        {
          id: 'pred-1',
          status: 'ACTIVE',
          outcomes: [
            { id: 'won-outcome', users: 10, title: 'Yes' },
            { id: 'lost-outcome', users: 5, title: 'No' },
          ],
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
        (c) => c.message === '[BETS] Retroactive resolution requested',
      )
      expect(requestLog?.meta).toMatchObject({ previousWon: null, won: true })

      const completedLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution completed successfully',
      )
      expect(completedLog?.meta).toMatchObject({ isCorrection: false })
    })

    it('logs previousWon and isCorrection=true on a flip', async () => {
      state.sessionMatch = baseMatchRow({ won: false })
      const client = makeClient()

      await resolveMatchRetroactively(client, '7777777777', true, 'modUser', '#streamer', 'msg-1')

      const requestLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution requested',
      )
      expect(requestLog?.meta).toMatchObject({ previousWon: false, won: true })

      const completedLog = state.loggerInfoCalls.find(
        (c) => c.message === '[BETS] Retroactive resolution completed successfully',
      )
      expect(completedLog?.meta).toMatchObject({ isCorrection: true, previousWon: false })
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
        'reply-target-1',
      )

      const finalSay = state.chatSayCalls[state.chatSayCalls.length - 1]
      expect(finalSay.messageId).toBe('reply-target-1')
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
        'reply-target-2',
      )

      expect(state.chatSayCalls[0].messageId).toBe('reply-target-2')
    })
  })
})
