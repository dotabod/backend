import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
// Route through the shared harness so `ws` and `@dotabod/shared-utils` are
// mocked once, process-wide, without competing factories.
import { EventsubSocket, FakeWebSocket, isEventsubConnected } from './sharedMocks.ts'

const welcomeMsg = (id = 'sess-1', keepalive = 10) => ({
  metadata: { message_type: 'session_welcome' },
  payload: { session: { id, keepalive_timeout_seconds: keepalive } },
})
const keepaliveMsg = () => ({ metadata: { message_type: 'session_keepalive' }, payload: {} })

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EventsubSocket lifecycle', () => {
  it('connects on construction and reports connected after session_welcome', () => {
    const sock = new EventsubSocket()
    expect(FakeWebSocket.instances).toHaveLength(1)

    FakeWebSocket.latest().open()
    FakeWebSocket.latest().message(welcomeMsg())
    expect(isEventsubConnected()).toBe(true)

    sock.dispose()
  })

  it('dispose() makes the socket inert: a late close neither flips the flag nor reconnects', async () => {
    const sock = new EventsubSocket()
    FakeWebSocket.latest().open()
    FakeWebSocket.latest().message(welcomeMsg())
    expect(isEventsubConnected()).toBe(true)

    const ws = FakeWebSocket.latest()
    sock.dispose()
    expect(sock.isDisposed).toBe(true)

    // The leak that caused the storm: a retired socket that still reacts to
    // closes (reconnecting) and writes the shared flag. After dispose, neither
    // must happen.
    ws.serverClose(1006)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(isEventsubConnected()).toBe(true) // unchanged by the disposed socket
    expect(FakeWebSocket.instances).toHaveLength(1) // no reconnect
  })

  it('dispose() on a still-CONNECTING socket survives the aborted handshake', async () => {
    // Constructed but never open()ed, so the underlying ws is still CONNECTING —
    // exactly the state the leaked, reconnect-looping sockets are in when a
    // re-init disposes them.
    const sock = new EventsubSocket()
    expect(FakeWebSocket.latest().readyState).toBe(FakeWebSocket.CONNECTING)

    sock.dispose()
    // ws aborts the pending upgrade and emits 'error' on a later tick — after
    // dispose()'s try/catch has returned, so it can't sink it there. Without a
    // retained error listener this is an unhandled 'error' that crashes the
    // process; dispose() must leave a sink so advancing the timer is harmless.
    await vi.advanceTimersByTimeAsync(0)

    expect(sock.isDisposed).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(1) // no reconnect
  })

  it('dispose() cancels a pending reconnect timer', async () => {
    const sock = new EventsubSocket()
    FakeWebSocket.latest().serverClose(1006) // schedules a reconnect
    sock.dispose()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1) // reconnect never fired
  })

  it('caps the reconnect backoff so the delay stays bounded', async () => {
    const sock = new EventsubSocket()
    // Uncapped, backoff (hence delay) grows without bound and a fixed advance
    // eventually stops triggering reconnects. Capped, every reconnect fires
    // within MAX_BACKOFF * 100ms, so a 1s advance keeps producing them.
    for (let i = 0; i < 25; i++) {
      FakeWebSocket.latest().serverClose(1006)
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(FakeWebSocket.instances).toHaveLength(26) // 1 initial + 25 reconnects
    sock.dispose()
  })

  it('resets backoff after a successful open', async () => {
    const sock = new EventsubSocket()
    for (let i = 0; i < 6; i++) {
      FakeWebSocket.latest().serverClose(1006)
      await vi.advanceTimersByTimeAsync(1000)
    }
    // A successful open resets backoff to 0, so the next reconnect fires within
    // ~100ms rather than the elevated delay.
    FakeWebSocket.latest().open()
    const before = FakeWebSocket.instances.length
    FakeWebSocket.latest().serverClose(1006)
    await vi.advanceTimersByTimeAsync(100)
    expect(FakeWebSocket.instances).toHaveLength(before + 1)
    sock.dispose()
  })

  it('backs off hard on HTTP 429 instead of reconnecting immediately', async () => {
    const sock = new EventsubSocket()
    // ws surfaces a rejected upgrade as an error then a 1006 close.
    FakeWebSocket.latest().error('Unexpected server response: 429')
    FakeWebSocket.latest().serverClose(1006)

    // Cooldown is 15–30s (jittered); nothing should reconnect within 14s.
    await vi.advanceTimersByTimeAsync(14_000)
    expect(FakeWebSocket.instances).toHaveLength(1)

    // After the full cooldown it reconnects exactly once.
    await vi.advanceTimersByTimeAsync(16_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    sock.dispose()
  })

  it('on silence: emits session_silenced, marks down, and does not self-reconnect', async () => {
    const sock = new EventsubSocket()
    FakeWebSocket.latest().open()
    FakeWebSocket.latest().message(welcomeMsg('sess-1', 10)) // silence window = 11s
    expect(isEventsubConnected()).toBe(true)

    let silenced = 0
    sock.on('session_silenced', () => {
      silenced++
    })

    const ws = FakeWebSocket.latest()
    await vi.advanceTimersByTimeAsync(11_000)
    expect(silenced).toBe(1)
    expect(isEventsubConnected()).toBe(false)

    // The silenced socket disabled its own reconnect (the conduitSetup backstop
    // owns recovery), so a subsequent close must NOT spin up a competing socket.
    ws.serverClose(1000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)

    sock.dispose()
  })

  it('a keepalive resets the silence timer and keeps the connection live', async () => {
    const sock = new EventsubSocket()
    FakeWebSocket.latest().open()
    FakeWebSocket.latest().message(welcomeMsg('sess-1', 10))

    // Just before the 11s window closes, a keepalive resets it.
    await vi.advanceTimersByTimeAsync(10_000)
    FakeWebSocket.latest().message(keepaliveMsg())
    // 20s total elapsed, but the timer was rearmed at 10s, so no silence yet.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(isEventsubConnected()).toBe(true)

    sock.dispose()
  })
})
