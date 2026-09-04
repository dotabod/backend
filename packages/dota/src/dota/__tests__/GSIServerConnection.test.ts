import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const socketState = vi.hoisted(() => ({
  emits: [] as Array<{ room: string; event: string; payload: unknown }>,
  handlers: new Map<string, (...args: any[]) => any>(),
  middleware: null as ((socket: any, next: (error?: Error) => void) => void) | null,
  requestHandlers: new Map<string, (...args: any[]) => any>(),
}))

const gsiState = vi.hoisted(() => ({
  handlers: new Map<string, any>(),
}))

const getWL = vi.hoisted(() => vi.fn())
const getDBUser = vi.hoisted(() => vi.fn())
const recordOverlayFirstSeen = vi.hoisted(() => vi.fn())

vi.mock('node:http', () => ({
  default: {
    createServer: () => ({
      listen: (_port: number, callback: () => void) => callback(),
    }),
  },
}))

vi.mock('socket.io', () => ({
  Server: class {
    use(handler: (socket: any, next: (error?: Error) => void) => void) {
      socketState.middleware = handler
    }

    on(event: string, handler: (...args: any[]) => any) {
      socketState.handlers.set(event, handler)
    }

    to(room: string) {
      return {
        emit: (event: string, payload: unknown) => {
          socketState.emits.push({ room, event, payload })
        },
      }
    }
  },
}))

vi.mock('@dotabod/shared-utils', () => ({
  getTwitchAPI: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  supabase: {},
}))

vi.mock('../../db/getDBUser', () => ({ default: getDBUser }))
vi.mock('../../db/getWL', () => ({ getWL }))
vi.mock('../../twitch/index', () => ({ twitchEvent: { emit: vi.fn() } }))
vi.mock('../DotaPatchChecker', () => ({ initDotaPatchChecker: vi.fn() }))
vi.mock('../GSIHandler', () => ({ emitMinimapBlockerStatus: vi.fn() }))
vi.mock('../globalEventEmitter', () => ({
  newData: vi.fn(),
  processChanges: () => vi.fn(),
  processUnmarkedKillListChanges: vi.fn(),
  recoverMultiAccount: vi.fn(),
}))
vi.mock('../lib/consts', () => ({ gsiHandlers: gsiState.handlers }))
vi.mock('../lib/matchData', () => ({ MatchDataService: class {} }))
vi.mock('../lib/remindUnresolvedMatches', () => ({
  remindUnresolvedMatches: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/twitchUtils', () => ({ deleteClipsBatch: vi.fn() }))
vi.mock('../setupSignals', () => ({ recordOverlayFirstSeen }))
vi.mock('../validateToken', () => ({ validateToken: vi.fn() }))

const { default: GSIServer } = await import('../GSIServer')

beforeEach(() => {
  vi.useFakeTimers()
  socketState.emits.length = 0
  socketState.handlers.clear()
  socketState.middleware = null
  socketState.requestHandlers.clear()
  gsiState.handlers.clear()
  getDBUser.mockReset()
  getWL.mockReset()
  recordOverlayFirstSeen.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('overlay socket connection state', () => {
  it('authenticates public WL sockets by Twitch channel ID', async () => {
    const client = { token: 'profile-token' }
    getDBUser.mockResolvedValue({ result: client })
    new GSIServer()
    const socket = {
      data: {},
      disconnect: vi.fn(),
      emit: vi.fn(),
      handshake: { auth: { client: 'profile-wl', twitchId: 'channel-1' } },
    }
    const next = vi.fn()

    socketState.middleware?.(socket, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith())

    expect(getDBUser).toHaveBeenCalledWith({ twitchId: 'channel-1' })
    expect(socket.data).toEqual({ clientType: 'profile-wl', dotabodClient: client })
  })

  it('waits for an in-flight user lookup instead of disconnecting the overlay', async () => {
    const client = { token: 'overlay-token' }
    getDBUser
      .mockResolvedValueOnce({ reason: 'Token is currently being looked up', result: null })
      .mockResolvedValueOnce({ reason: 'User successfully retrieved', result: client })
    new GSIServer()
    const socket = {
      data: {},
      disconnect: vi.fn(),
      emit: vi.fn(),
      handshake: { auth: { token: 'overlay-token' } },
    }
    const next = vi.fn()

    socketState.middleware?.(socket, next)
    await Promise.resolve()

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(socket.emit).not.toHaveBeenCalledWith('auth_error', 'Invalid token')

    await vi.advanceTimersByTimeAsync(100)

    expect(next).toHaveBeenCalledWith()
    expect(getDBUser).toHaveBeenCalledTimes(2)
  })

  it('immediately sends the current hero-demo blocker instead of waiting for another GSI tick', async () => {
    const server = new GSIServer()
    const setupOBSBlockers = vi.fn().mockResolvedValue(undefined)
    gsiState.handlers.set('overlay-token', {
      blockCache: null,
      client: {
        beta_tester: false,
        gsi: {
          map: {
            customgamename: 'hero_demo',
            game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
            matchid: '0',
          },
        },
        gsiUpdatedAt: Date.now(),
        stream_online: true,
      },
      disabled: false,
      emitBadgeUpdate: vi.fn(),
      emitWLUpdate: vi.fn(),
      setupOBSBlockers,
    })

    const connectionHandler = socketState.handlers.get('connection')
    expect(connectionHandler).toBeDefined()

    await connectionHandler?.({
      handshake: { auth: { token: 'overlay-token' } },
      join: vi.fn().mockResolvedValue(undefined),
    })

    expect(setupOBSBlockers).toHaveBeenCalledWith('DOTA_GAMERULES_STATE_GAME_IN_PROGRESS')
    expect(server.io).toBeDefined()
  })

  it('clears a spectator overlay after GSI stops arriving', async () => {
    new GSIServer()
    gsiState.handlers.set('stale-overlay-token', {
      blockCache: 'spectator',
      client: {
        beta_tester: false,
        gsi: {
          map: {
            game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
            matchid: '8980144969',
          },
          player: { activity: 'watching', team_name: 'spectator' },
        },
        gsiUpdatedAt: Date.now() - 76_000,
        stream_online: true,
        token: 'stale-overlay-token',
      },
      disabled: false,
      emitBadgeUpdate: vi.fn(),
      emitWLUpdate: vi.fn(),
      setupOBSBlockers: vi.fn(),
    })

    await vi.advanceTimersByTimeAsync(15_000)

    expect(socketState.emits).toContainEqual({
      room: 'stale-overlay-token',
      event: 'block',
      payload: {
        matchId: null,
        state: 'GSI_STALE',
        team: null,
        type: null,
      },
    })
    expect(socketState.emits).toContainEqual({
      room: 'stale-overlay-token',
      event: 'notable-players',
      payload: [],
    })
  })

  it('returns WL data for an offline profile and honors a preview window', async () => {
    new GSIServer()
    getWL.mockResolvedValue({
      record: [{ lose: 3, type: 'R', win: 8 }],
      statsDays: 30,
    })
    gsiState.handlers.set('profile-token', {
      client: {
        Account: { providerAccountId: 'channel-1' },
        locale: 'en',
        settings: [{ key: 'wlStatsDays', value: 7 }],
        stream_online: false,
        stream_start_date: null,
        subscription: undefined,
        token: 'profile-token',
      },
      disabled: true,
    })

    const connectionHandler = socketState.handlers.get('connection')
    await connectionHandler?.({
      data: {
        clientType: 'win-loss',
        dotabodClient: gsiState.handlers.get('profile-token').client,
      },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: (...args: any[]) => any) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.({ statsDays: 30 }, respond)

    expect(getWL).toHaveBeenCalledWith({
      channelId: 'channel-1',
      lng: 'en',
      mmrEnabled: false,
      settings: [{ key: 'wlStatsDays', value: 7 }],
      statsDaysOverride: 30,
      streamStartDate: null,
      subscription: undefined,
    })
    expect(respond).toHaveBeenCalledWith({
      records: [{ lose: 3, type: 'R', win: 8 }],
      statsDays: 30,
    })
  })

  it('joins public profiles to the WL-only room', async () => {
    new GSIServer()
    const join = vi.fn().mockResolvedValue(undefined)
    gsiState.handlers.set('profile-token', {
      client: {
        Account: { providerAccountId: 'channel-1' },
        locale: 'en',
        settings: [],
        stream_online: true,
        stream_start_date: new Date('2026-09-04T08:00:00.000Z'),
        token: 'profile-token',
      },
      disabled: false,
      emitBadgeUpdate: vi.fn(),
      emitWLUpdate: vi.fn(),
      setupOBSBlockers: vi.fn(),
    })

    await socketState.handlers.get('connection')?.({
      data: {
        clientType: 'profile-wl',
        dotabodClient: gsiState.handlers.get('profile-token').client,
      },
      handshake: { auth: { client: 'profile-wl', twitchId: 'channel-1' } },
      join,
      on: vi.fn(),
    })

    expect(join).toHaveBeenCalledWith('profile-wl:channel-1')
    expect(join).not.toHaveBeenCalledWith('profile-token')
    expect(gsiState.handlers.get('profile-token').emitBadgeUpdate).not.toHaveBeenCalled()
    expect(recordOverlayFirstSeen).not.toHaveBeenCalled()
  })

  it('does not let a public profile query arbitrary WL windows', async () => {
    new GSIServer()
    const client = {
      Account: { providerAccountId: 'channel-1' },
      locale: 'en',
      settings: [{ key: 'wlStatsDays', value: 30 }],
      stream_online: true,
      stream_start_date: new Date('2026-09-04T08:00:00.000Z'),
      token: 'profile-token',
    }

    await socketState.handlers.get('connection')?.({
      data: { clientType: 'profile-wl', dotabodClient: client },
      handshake: { auth: { client: 'profile-wl', twitchId: 'channel-1' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: (...args: any[]) => any) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.({ statsDays: 365 }, respond)

    expect(getWL).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({
      error: 'Stats window overrides are only available in settings',
    })
  })

  it('rejects an invalid WL preview window before querying the database', async () => {
    new GSIServer()
    gsiState.handlers.set('profile-token', {
      client: {
        Account: { providerAccountId: 'channel-1' },
        locale: 'en',
        settings: [],
        stream_online: false,
        stream_start_date: null,
        token: 'profile-token',
      },
      disabled: true,
    })

    await socketState.handlers.get('connection')?.({
      data: {
        clientType: 'win-loss',
        dotabodClient: gsiState.handlers.get('profile-token').client,
      },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: (...args: any[]) => any) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.({ statsDays: 366 }, respond)

    expect(getWL).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({ error: 'Invalid stats window' })
  })
})
