import type { Server } from 'socket.io'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { handleStreamStatusTransition } from '../handleStreamStatusTransition'

const createIo = () => {
  const emit = vi.fn(() => undefined)
  const to = vi.fn(() => ({ emit }))

  return {
    emit,
    io: { to } as unknown as Pick<Server, 'to'>,
    to,
  }
}

const createClient = (streamOnline: boolean) => ({
  gsi: { map: { matchid: '7777777777' } } as any,
  gsiUpdatedAt: 123,
  name: 'tester',
  stream_online: streamOnline,
  token: 'token-1',
})

describe('handleStreamStatusTransition', () => {
  const logger = {
    error: vi.fn(() => undefined),
  }

  beforeEach(() => {
    logger.error.mockClear()
  })

  it('emits refresh-settings when a stream goes offline', () => {
    const { emit, io, to } = createIo()
    const disable = vi.fn(() => undefined)
    const client = createClient(false)

    const result = handleStreamStatusTransition({
      client,
      connectedUser: { disable } as any,
      io,
      logger,
      oldStreamOnline: true,
    })

    expect(result).toEqual({ changed: true, cameOnline: false, wentOffline: true })
    expect(to).toHaveBeenCalledWith('token-1')
    expect(emit).toHaveBeenCalledWith('refresh-settings', 'mutate')
    expect(client.gsi).toBeUndefined()
    expect(client.gsiUpdatedAt).toBeUndefined()
    expect(disable).toHaveBeenCalledOnce()
  })

  it('emits refresh-settings and enables the GSI handler when a stream comes online', () => {
    const { emit, io, to } = createIo()
    const enable = vi.fn(() => undefined)

    const result = handleStreamStatusTransition({
      client: createClient(true),
      connectedUser: { enable },
      io,
      logger,
      oldStreamOnline: false,
    })

    expect(result).toEqual({ changed: true, cameOnline: true, wentOffline: false })
    expect(to).toHaveBeenCalledWith('token-1')
    expect(emit).toHaveBeenCalledWith('refresh-settings', 'mutate')
    expect(enable).toHaveBeenCalled()
  })

  it('promotes a recently buffered offline GSI packet when the stream comes online', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'))
    const { io } = createIo()
    const pendingGsi = { map: { matchid: '8888888888' } } as any
    const client = {
      ...createClient(true),
      gsi: undefined,
      gsiUpdatedAt: undefined,
      pendingGsi,
      pendingGsiUpdatedAt: Date.now() - 30_000,
    }

    handleStreamStatusTransition({
      client,
      connectedUser: null,
      io,
      logger,
      oldStreamOnline: false,
    })

    expect(client.gsi).toBe(pendingGsi)
    expect(client.gsiUpdatedAt).toBe(Date.now() - 30_000)
    expect(client.pendingGsi).toBeUndefined()
    expect(client.pendingGsiUpdatedAt).toBeUndefined()
    vi.useRealTimers()
  })

  it('still emits refresh-settings when a stream comes online without a GSI handler', () => {
    const { emit, io } = createIo()

    handleStreamStatusTransition({
      client: createClient(true),
      connectedUser: null,
      io,
      logger,
      oldStreamOnline: false,
    })

    expect(emit).toHaveBeenCalledWith('refresh-settings', 'mutate')
  })

  it('does not let enable failures block the refresh-settings emit', () => {
    const { emit, io } = createIo()
    const enable = vi.fn(() => {
      throw new Error('enable failed')
    })

    expect(() =>
      handleStreamStatusTransition({
        client: createClient(true),
        connectedUser: { enable },
        io,
        logger,
        oldStreamOnline: false,
      }),
    ).not.toThrow()

    expect(emit).toHaveBeenCalledWith('refresh-settings', 'mutate')
    expect(logger.error).toHaveBeenCalled()
  })
})
