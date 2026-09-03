import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const socketState = vi.hoisted(() => ({
  emits: [] as Array<{ room: string; event: string; payload: unknown }>,
  handlers: new Map<string, (...args: any[]) => any>(),
}))

const gsiState = vi.hoisted(() => ({
  handlers: new Map<string, any>(),
}))

vi.mock('node:http', () => ({
  default: {
    createServer: () => ({
      listen: (_port: number, callback: () => void) => callback(),
    }),
  },
}))

vi.mock('socket.io', () => ({
  Server: class {
    use() {}

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

vi.mock('../../db/getDBUser', () => ({ default: vi.fn() }))
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
vi.mock('../setupSignals', () => ({ recordOverlayFirstSeen: vi.fn() }))
vi.mock('../validateToken', () => ({ validateToken: vi.fn() }))

const { default: GSIServer } = await import('../GSIServer')

beforeEach(() => {
  vi.useFakeTimers()
  socketState.emits.length = 0
  socketState.handlers.clear()
  gsiState.handlers.clear()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('overlay socket connection state', () => {
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
})
