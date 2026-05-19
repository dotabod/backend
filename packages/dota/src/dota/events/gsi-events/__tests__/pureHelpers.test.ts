import { describe, expect, it } from 'bun:test'
import { initTestI18n } from '../../../../__tests__/sharedMocks.ts'

await initTestI18n()

const { generateAegisMessage } = await import('../generateAegisMessage.js')
const { getRoshCountMessage } = await import('../getRoshCountMessage.js')
const { getNewAegisTime } = await import('../getNewAegisTime.js')

describe('generateAegisMessage', () => {
  it('returns aegis.pickup when the aegis is still active', () => {
    const msg = generateAegisMessage(
      {
        expireS: 290,
        playerId: 0,
        expireTime: '12:35',
        expireDate: new Date(Date.now() + 290_000),
        snatched: false,
        heroName: 'Lina',
      },
      'en',
    )
    expect(msg).toContain('Lina')
  })

  it('returns aegis.snatched when snatched is true', () => {
    const msg = generateAegisMessage(
      {
        expireS: 200,
        playerId: 0,
        expireTime: '10:00',
        expireDate: new Date(Date.now() + 200_000),
        snatched: true,
        heroName: 'Pudge',
      },
      'en',
    )
    expect(msg).toContain('PepeLaugh')
  })

  it('returns aegis.expired when expireS recalculates to 0', () => {
    const msg = generateAegisMessage(
      {
        expireS: 10,
        playerId: 0,
        expireTime: '0:10',
        // expireDate in the past → getNewAegisTime drives expireS back to 0.
        expireDate: new Date(Date.now() - 60_000),
        snatched: false,
        heroName: 'Lina',
      },
      'en',
    )
    expect(msg).toContain('Lina')
  })
})

describe('getRoshCountMessage', () => {
  it('returns the first-rosh message for count=1', () => {
    expect(getRoshCountMessage({ lng: 'en', count: 1 })).toBeDefined()
  })

  it('returns distinct messages for counts 1, 2, 3', () => {
    const a = getRoshCountMessage({ lng: 'en', count: 1 })
    const b = getRoshCountMessage({ lng: 'en', count: 2 })
    const c = getRoshCountMessage({ lng: 'en', count: 3 })
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('falls through to roshanCount.more for counts > 3', () => {
    const msg = getRoshCountMessage({ lng: 'en', count: 4 })
    expect(msg).toContain('4')
  })
})

describe('getNewAegisTime', () => {
  it('recalculates expireS from expireDate into the future', () => {
    const res = getNewAegisTime({
      expireS: 0,
      playerId: 0,
      expireTime: '0:00',
      expireDate: new Date(Date.now() + 120_000),
      snatched: false,
      heroName: 'Lina',
    })
    expect(res.expireS).toBeGreaterThan(115)
    expect(res.expireS).toBeLessThanOrEqual(120)
  })

  it('clamps expireS to 0 when expireDate is in the past', () => {
    const res = getNewAegisTime({
      expireS: 100,
      playerId: 0,
      expireTime: '1:40',
      expireDate: new Date(Date.now() - 60_000),
      snatched: false,
      heroName: 'Lina',
    })
    expect(res.expireS).toBe(0)
  })
})
