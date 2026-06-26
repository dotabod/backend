import { describe, expect, it } from 'vite-plus/test'
import { computeReconnectDelay } from '../utils/reconnectBackoff'

describe('computeReconnectDelay', () => {
  // random: () => 1 yields the upper bound of the jitter window (exp), making
  // the exponential growth and cap deterministic to assert.
  const upper = { baseMs: 5_000, maxMs: 300_000, random: () => 1 }
  // random: () => 0 yields the lower bound (exp / 2).
  const lower = { baseMs: 5_000, maxMs: 300_000, random: () => 0 }

  it('grows exponentially up to the cap', () => {
    expect(computeReconnectDelay(1, upper)).toBe(5_000)
    expect(computeReconnectDelay(2, upper)).toBe(10_000)
    expect(computeReconnectDelay(3, upper)).toBe(20_000)
    expect(computeReconnectDelay(4, upper)).toBe(40_000)
    // 5000 * 2**6 = 320_000 exceeds the 300_000 cap.
    expect(computeReconnectDelay(7, upper)).toBe(300_000)
  })

  it('never exceeds the cap, even for absurd attempt counts', () => {
    expect(computeReconnectDelay(50, upper)).toBe(300_000)
    expect(computeReconnectDelay(1_000, upper)).toBe(300_000)
  })

  it('applies equal jitter — delay never collapses below half the window', () => {
    expect(computeReconnectDelay(1, lower)).toBe(2_500)
    expect(computeReconnectDelay(2, lower)).toBe(5_000)
    expect(computeReconnectDelay(7, lower)).toBe(150_000)
  })

  it('treats attempts < 1 as the first attempt', () => {
    expect(computeReconnectDelay(0, upper)).toBe(5_000)
    expect(computeReconnectDelay(-3, upper)).toBe(5_000)
  })

  it('stays within [exp/2, exp] for real randomness', () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const lo = computeReconnectDelay(attempt, lower)
      const hi = computeReconnectDelay(attempt, upper)
      const actual = computeReconnectDelay(attempt)
      expect(actual).toBeGreaterThanOrEqual(lo)
      expect(actual).toBeLessThanOrEqual(hi)
    }
  })
})
