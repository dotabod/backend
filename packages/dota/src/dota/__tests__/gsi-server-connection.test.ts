import type { Server, Socket } from 'socket.io'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  createTwitchAccountStub,
} from '../../__tests__/shared-mocks'
import type { GSIHandlerType } from '../gsi-handler-types'

type ServerConnectionHandler = Parameters<Server['on']>[1]
type SocketEventHandler = Parameters<Socket['on']>[1]
interface MiddlewareSocket {
  data: {
    clientType?: string
    dotabodClient?: unknown
  }
  disconnect: (close?: boolean) => unknown
  emit: (event: string, ...args: unknown[]) => unknown
  handshake: {
    auth: {
      client?: string
      token?: string
      twitchId?: string
    }
  }
}
type SocketMiddleware = (socket: MiddlewareSocket, next: () => void) => void

const socketState = vi.hoisted(() => ({
  emits: [] as { room: string; event: string; payload: unknown }[],
  handlers: new Map<string, ServerConnectionHandler>(),
  middleware: null as SocketMiddleware | null,
  requestHandlers: new Map<string, SocketEventHandler>(),
}))

const gsiState = vi.hoisted(() => ({
  handlers: new Map<string, GSIHandlerType>(),
}))

const getWL = vi.hoisted(() => vi.fn())
const getDBUser = vi.hoisted(() => vi.fn())
const recordOverlaySocketActivity = vi.hoisted(() => vi.fn())

vi.mock('node:http', () => ({
  default: {
    createServer: () => ({
      listen: (_port: number, callback: () => void) => {
        callback()
      },
    }),
  },
}))

vi.mock('socket.io', () => ({
  Server: class {
    use(handler: SocketMiddleware) {
      socketState.middleware = handler
    }

    on(event: string, handler: ServerConnectionHandler) {
      socketState.handlers.set(event, handler)
    }

    to(room: string) {
      return {
        emit: (event: string, payload: unknown) => {
          socketState.emits.push({ event, payload, room })
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

vi.mock('../../db/get-db-user', () => ({ default: getDBUser }))
vi.mock('../../db/get-wl', () => ({ getWL }))
vi.mock('../../twitch/index', () => ({ twitchEvent: { emit: vi.fn() } }))
vi.mock('../dota-patch-checker', () => ({ initDotaPatchChecker: vi.fn() }))
vi.mock('../gsi-handler', () => ({ emitMinimapBlockerStatus: vi.fn() }))
vi.mock('../global-event-emitter', () => ({
  newData: vi.fn(),
  processChanges: () => vi.fn(),
  processUnmarkedKillListChanges: vi.fn(),
  recoverMultiAccount: vi.fn(),
}))
vi.mock('../lib/consts', () => ({ gsiHandlers: gsiState.handlers }))
vi.mock('../lib/matchData', () => ({ MatchDataService: class {} }))
vi.mock('../lib/remind-unresolved-matches', () => ({
  remindUnresolvedMatches: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/twitch-utils', () => ({ deleteClipsBatch: vi.fn() }))
vi.mock('../setup-signals', () => ({ recordOverlaySocketActivity }))
vi.mock('../validate-token', () => ({ validateToken: vi.fn() }))

const { default: GSIServer } = await import('../gsi-server')

beforeEach(() => {
  vi.useFakeTimers()
  socketState.emits.length = 0
  socketState.handlers.clear()
  socketState.middleware = null
  socketState.requestHandlers.clear()
  gsiState.handlers.clear()
  getDBUser.mockReset()
  getWL.mockReset()
  recordOverlaySocketActivity.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('overlay socket connection state', () => {
  it('refreshes overlay activity when the browser source sends a heartbeat', async () => {
    new GSIServer()
    const handlers = new Map<string, () => void>()
    const socket = {
      data: { dotabodClient: { token: 'overlay-heartbeat' } },
      handshake: { auth: { token: 'overlay-heartbeat' } },
      join: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
    }

    await socketState.handlers.get('connection')?.(socket)
    handlers.get('diagnostic-heartbeat')?.()

    expect(recordOverlaySocketActivity).toHaveBeenCalledTimes(2)
  })

  it('does not count a dashboard diagnostic socket as an OBS overlay', async () => {
    new GSIServer()
    const broadcastEmit = vi.fn()
    const socket = {
      data: { clientType: 'setup-diagnostic', dotabodClient: { token: 'diagnostic-token' } },
      emit: vi.fn(),
      handshake: { auth: { client: 'setup-diagnostic', token: 'diagnostic-token' } },
      join: vi.fn(),
      on: vi.fn(),
      to: vi.fn(() => ({ emit: broadcastEmit })),
    }

    await socketState.handlers.get('connection')?.(socket)

    expect(recordOverlaySocketActivity).not.toHaveBeenCalled()
    expect(socket.join).not.toHaveBeenCalled()
    expect(socket.to).toHaveBeenCalledWith('diagnostic-token')
    expect(broadcastEmit).toHaveBeenCalledWith('diagnostic-overlay-probe')
    expect(socket.emit).toHaveBeenCalledWith('diagnostic-ready', { status: 'ok' })
  })

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
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledOnce()
    })

    expect(getDBUser).toHaveBeenCalledWith({ twitchId: 'channel-1' })
    expect(socket.data).toStrictEqual({ clientType: 'profile-wl', dotabodClient: client })
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

    expect(next).toHaveBeenCalledOnce()
    expect(getDBUser).toHaveBeenCalledTimes(2)
  })

  it('immediately sends the current hero-demo blocker instead of waiting for another GSI tick', async () => {
    const server = new GSIServer()
    const setupOBSBlockers = vi.fn().mockResolvedValue(undefined)
    const client = createSocketClientStub({
      beta_tester: false,
      gsi: createPacketStub({
        map: {
          customgamename: 'hero_demo',
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          matchid: '0',
        },
      }),
      gsiUpdatedAt: Date.now(),
      stream_online: true,
      token: 'overlay-token',
    })
    gsiState.handlers.set(
      'overlay-token',
      createGsiHandlerStub(client, {
        blockCache: null,
        disabled: false,
        emitBadgeUpdate: vi.fn(),
        emitWLUpdate: vi.fn(),
        setupOBSBlockers,
      })
    )

    const connectionHandler = socketState.handlers.get('connection')
    expect(connectionHandler).toBeDefined()

    await connectionHandler?.({
      handshake: { auth: { token: 'overlay-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    })

    expect(setupOBSBlockers).toHaveBeenCalledWith('DOTA_GAMERULES_STATE_GAME_IN_PROGRESS')
    expect(server.io).toBeDefined()
  })

  it('clears a spectator overlay after GSI stops arriving', async () => {
    new GSIServer()
    const client = createSocketClientStub({
      gsi: createPacketStub({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          matchid: '8980144969',
        },
        player: { activity: 'watching', team_name: 'spectator' },
      }),
      gsiUpdatedAt: Date.now() - 76_000,
      stream_online: true,
      token: 'stale-overlay-token',
    })
    gsiState.handlers.set(
      'stale-overlay-token',
      createGsiHandlerStub(client, {
        blockCache: 'spectator',
        disabled: false,
        emitBadgeUpdate: vi.fn(),
        emitWLUpdate: vi.fn(),
        setupOBSBlockers: vi.fn(),
      })
    )

    await vi.advanceTimersByTimeAsync(15_000)

    expect(socketState.emits).toContainEqual({
      event: 'block',
      payload: {
        matchId: null,
        state: 'GSI_STALE',
        team: null,
        type: null,
      },
      room: 'stale-overlay-token',
    })
    expect(socketState.emits).toContainEqual({
      event: 'notable-players',
      payload: [],
      room: 'stale-overlay-token',
    })
  })

  it('returns WL data for an offline profile and honors a preview window', async () => {
    new GSIServer()
    getWL.mockResolvedValue({
      record: [{ lose: 3, type: 'R', win: 8 }],
      statsDays: 14,
      statsDaysTotal: 30,
    })
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'channel-1' }),
      locale: 'en',
      settings: [{ key: 'wlStatsDays', value: 7 }],
      stream_online: false,
      stream_start_date: null,
      subscription: undefined,
      token: 'profile-token',
    })
    gsiState.handlers.set(
      'profile-token',
      createGsiHandlerStub(client, {
        disabled: true,
      })
    )

    const connectionHandler = socketState.handlers.get('connection')
    await connectionHandler?.({
      data: {
        clientType: 'win-loss',
        dotabodClient: gsiState.handlers.get('profile-token')?.client,
      },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: SocketEventHandler) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.(
      { statsDays: 30, statsStartDate: '2026-08-21' },
      respond
    )

    expect(getWL).toHaveBeenCalledWith({
      channelId: 'channel-1',
      lng: 'en',
      mmrEnabled: false,
      settings: [{ key: 'wlStatsDays', value: 7 }],
      statsDaysOverride: 30,
      statsStartDateOverride: '2026-08-21',
      streamStartDate: null,
      subscription: undefined,
      userId: 'profile-token',
    })
    expect(respond).toHaveBeenCalledWith({
      records: [{ lose: 3, type: 'R', win: 8 }],
      statsDays: 14,
      statsDaysTotal: 30,
    })
  })

  it('joins public profiles to the WL-only room', async () => {
    new GSIServer()
    const join = vi.fn().mockResolvedValue(undefined)
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'channel-1' }),
      stream_online: true,
      stream_start_date: new Date('2026-09-04T08:00:00.000Z'),
      token: 'profile-token',
    })
    gsiState.handlers.set(
      'profile-token',
      createGsiHandlerStub(client, {
        disabled: false,
        emitBadgeUpdate: vi.fn(),
        emitWLUpdate: vi.fn(),
        setupOBSBlockers: vi.fn(),
      })
    )

    await socketState.handlers.get('connection')?.({
      data: {
        clientType: 'profile-wl',
        dotabodClient: gsiState.handlers.get('profile-token')?.client,
      },
      handshake: { auth: { client: 'profile-wl', twitchId: 'channel-1' } },
      join,
      on: vi.fn(),
    })

    expect(join).toHaveBeenCalledWith('profile-wl:channel-1')
    expect(join).not.toHaveBeenCalledWith('profile-token')
    expect(gsiState.handlers.get('profile-token')?.emitBadgeUpdate).not.toHaveBeenCalled()
    expect(recordOverlaySocketActivity).not.toHaveBeenCalled()
  })

  it('joins the private dashboard preview to the WL-only room for correction updates', async () => {
    new GSIServer()
    const join = vi.fn().mockResolvedValue(undefined)
    const client = {
      Account: { providerAccountId: 'channel-1' },
      locale: 'en',
      settings: [],
      stream_online: false,
      stream_start_date: null,
      token: 'profile-token',
    }

    await socketState.handlers.get('connection')?.({
      data: { clientType: 'win-loss', dotabodClient: client },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join,
      on: vi.fn(),
    })

    expect(join).toHaveBeenCalledWith('profile-wl:channel-1')
    expect(join).not.toHaveBeenCalledWith('profile-token')
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
      on: (event: string, handler: SocketEventHandler) => {
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
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'channel-1' }),
      stream_online: false,
      stream_start_date: null,
      token: 'profile-token',
    })
    gsiState.handlers.set(
      'profile-token',
      createGsiHandlerStub(client, {
        disabled: true,
      })
    )

    await socketState.handlers.get('connection')?.({
      data: {
        clientType: 'win-loss',
        dotabodClient: gsiState.handlers.get('profile-token')?.client,
      },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: SocketEventHandler) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.({ statsDays: 366 }, respond)

    expect(getWL).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({ error: 'Invalid stats window' })
  })

  it('rejects an impossible WL challenge start date before querying the database', async () => {
    new GSIServer()
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'channel-1' }),
      stream_online: false,
      stream_start_date: null,
      token: 'profile-token',
    })
    gsiState.handlers.set(
      'profile-token',
      createGsiHandlerStub(client, {
        disabled: true,
      })
    )

    await socketState.handlers.get('connection')?.({
      data: {
        clientType: 'win-loss',
        dotabodClient: gsiState.handlers.get('profile-token')?.client,
      },
      handshake: { auth: { client: 'win-loss', token: 'profile-token' } },
      join: vi.fn().mockResolvedValue(undefined),
      on: (event: string, handler: SocketEventHandler) => {
        socketState.requestHandlers.set(event, handler)
      },
    })

    const respond = vi.fn()
    await socketState.requestHandlers.get('request-wl')?.(
      { statsDays: 30, statsStartDate: '2026-02-30' },
      respond
    )

    expect(getWL).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({ error: 'Invalid stats start date' })
  })
})
