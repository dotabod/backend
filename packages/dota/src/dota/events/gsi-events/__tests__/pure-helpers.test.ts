import { t } from 'i18next'
import { describe, expect, it } from 'vitest'

import { initTestI18n } from '../../../../__tests__/shared-mocks.ts'

await initTestI18n()

const { generateAegisMessage } = await import('../generate-aegis-message')
const { getRoshCountMessage } = await import('../get-rosh-count-message')
const { getNewAegisTime } = await import('../get-new-aegis-time')

describe('generateAegisMessage', () => {
  it('returns aegis.pickup when the aegis is still active', () => {
    const msg = generateAegisMessage(
      {
        expireDate: new Date(Date.now() + 290_000),
        expireS: 290,
        expireTime: '12:35',
        heroName: 'Lina',
        playerId: 0,
        snatched: false,
      },
      'en'
    )
    expect(msg).toContain('Lina')
  })

  it('returns aegis.snatched when snatched is true', () => {
    const msg = generateAegisMessage(
      {
        expireDate: new Date(Date.now() + 200_000),
        expireS: 200,
        expireTime: '10:00',
        heroName: 'Pudge',
        playerId: 0,
        snatched: true,
      },
      'en'
    )
    expect(msg).toBe(t('aegis.snatched', { emote: 'PepeLaugh', heroName: 'Pudge', lng: 'en' }))
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
      'en'
    )
    expect(msg).toContain('Lina')
  })

  it('returns aegis.pickupUnknown when heroName is null and aegis is active', () => {
    const msg = generateAegisMessage(
      {
        expireDate: new Date(Date.now() + 290_000),
        expireS: 290,
        expireTime: '12:35',
        heroName: null,
        playerId: 0,
        snatched: false,
      },
      'en'
    )
    expect(msg).toBe(t('aegis.pickupUnknown', { lng: 'en' }))
  })

  it('returns aegis.snatchedUnknown when heroName is null and snatched', () => {
    const msg = generateAegisMessage(
      {
        expireDate: new Date(Date.now() + 200_000),
        expireS: 200,
        expireTime: '10:00',
        heroName: null,
        playerId: 0,
        snatched: true,
      },
      'en'
    )
    expect(msg).toBe(t('aegis.snatchedUnknown', { lng: 'en' }))
  })

  it('returns aegis.expiredUnknown when heroName is null and aegis has expired', () => {
    const msg = generateAegisMessage(
      {
        expireDate: new Date(Date.now() - 60_000),
        expireS: 10,
        expireTime: '0:10',
        heroName: null,
        playerId: 0,
        snatched: false,
      },
      'en'
    )
    expect(msg).toBe(t('aegis.expiredUnknown', { emote: ':)', lng: 'en' }))
  })
})

describe('getRoshCountMessage', () => {
  it('returns the first-rosh message for count=1', () => {
    expect(getRoshCountMessage({ count: 1, lng: 'en' })).toBeDefined()
  })

  it('returns distinct messages for counts 1, 2, 3', () => {
    const a = getRoshCountMessage({ count: 1, lng: 'en' })
    const b = getRoshCountMessage({ count: 2, lng: 'en' })
    const c = getRoshCountMessage({ count: 3, lng: 'en' })
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('falls through to roshanCount.more for counts > 3', () => {
    const msg = getRoshCountMessage({ count: 4, lng: 'en' })
    expect(msg).toContain('4')
  })
})

describe('getNewAegisTime', () => {
  it('recalculates expireS from expireDate into the future', () => {
    const res = getNewAegisTime({
      expireDate: new Date(Date.now() + 120_000),
      expireS: 0,
      expireTime: '0:00',
      heroName: 'Lina',
      playerId: 0,
      snatched: false,
    })
    expect(res.expireS).toBeGreaterThan(115)
    expect(res.expireS).toBeLessThanOrEqual(120)
  })

  it('clamps expireS to 0 when expireDate is in the past', () => {
    const res = getNewAegisTime({
      expireDate: new Date(Date.now() - 60_000),
      expireS: 100,
      expireTime: '1:40',
      heroName: 'Lina',
      playerId: 0,
      snatched: false,
    })
    expect(res.expireS).toBe(0)
  })
})
