import { describe, expect, it } from 'vite-plus/test'
import { GcWatchdog } from '../utils/gcWatchdog'

// Deterministic injectable clock: advance() moves virtual time forward so the
// escalation ladder (spacing + dead-exit ceiling) is exact and non-flaky.
function makeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

const opts = (clock: ReturnType<typeof makeClock>) => ({
  now: clock.now,
  deadExitMs: 180_000,
  relaunchIntervalMs: 30_000,
})

describe('GcWatchdog', () => {
  it('starts not-ready and becomes ready on gcReady', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    expect(wd.isReady()).toBe(false)
    expect(wd.step({ type: 'gcReady' })).toEqual({ type: 'noop' })
    expect(wd.isReady()).toBe(true)
  })

  it('relaunches at most once per relaunchInterval — never two knock loops at once', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    wd.step({ type: 'gcReady' })

    // GC drops. First hello timeout after the interval → one relaunch.
    wd.step({ type: 'gcUnready' })
    clock.advance(30_000)
    expect(wd.step({ type: 'helloTimeout' }).type).toBe('relaunch')

    // A second hello timeout 5s later must NOT relaunch again (would fork a loop).
    clock.advance(5_000)
    expect(wd.step({ type: 'helloTimeout' }).type).toBe('noop')

    // A tick shortly after also stays quiet.
    clock.advance(5_000)
    expect(wd.step({ type: 'tick' }).type).toBe('noop')

    // Only once the interval elapses again do we permit the next relaunch.
    clock.advance(20_000) // 30s since last relaunch
    expect(wd.step({ type: 'helloTimeout' }).type).toBe('relaunch')
  })

  it('escalates to exit once GC is not-ready past the dead ceiling', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    wd.step({ type: 'gcReady' })
    wd.step({ type: 'gcUnready' })

    // Walk the relaunch ladder up toward the ceiling.
    for (let elapsed = 30_000; elapsed < 180_000; elapsed += 30_000) {
      clock.advance(30_000)
      expect(wd.step({ type: 'helloTimeout' }).type).toBe('relaunch')
    }

    // At/after deadExitMs of continuous not-ready, we exit instead of relaunch.
    clock.advance(30_000) // now 180_000 since unready
    const action = wd.step({ type: 'helloTimeout' })
    expect(action.type).toBe('exit')
    if (action.type === 'exit') expect(action.reason).toContain('exiting')
  })

  it('a gcReady resets the ladder so later trouble starts fresh', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    wd.step({ type: 'gcUnready' })
    clock.advance(170_000) // almost dead

    // Recovered.
    wd.step({ type: 'gcReady' })
    expect(wd.isReady()).toBe(true)

    // New trouble much later must not inherit the old not-ready age (no instant exit).
    clock.advance(1_000_000)
    wd.step({ type: 'gcUnready' })
    clock.advance(30_000)
    expect(wd.step({ type: 'helloTimeout' }).type).toBe('relaunch')
  })

  it('a CM disconnect that never recovers reaches exit', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    wd.step({ type: 'gcReady' })

    wd.step({ type: 'disconnected' })
    // No loggedOn / gcReady follows. Ticks eventually cross the ceiling.
    clock.advance(180_000)
    expect(wd.step({ type: 'tick' }).type).toBe('exit')
  })

  it('a tick while healthy never manufactures a relaunch or exit', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    wd.step({ type: 'gcReady' })
    clock.advance(10_000_000)
    expect(wd.step({ type: 'tick' }).type).toBe('noop')
    expect(wd.isReady()).toBe(true)
  })

  it('loggedOn without reaching gcReady still escalates to exit', () => {
    const clock = makeClock()
    const wd = new GcWatchdog(opts(clock))
    // Fresh process: not-ready clock runs from construction.
    wd.step({ type: 'loggedOn' })
    clock.advance(180_000)
    expect(wd.step({ type: 'tick' }).type).toBe('exit')
  })
})
