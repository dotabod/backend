import { describe, expect, it } from 'vitest'

import { GsiSelfResolver } from '../../resolvers/gsi-self-resolver'

const ctx = (gsi?: unknown) => ({ gsi: gsi as never, matchId: '12345' })

describe(GsiSelfResolver, () => {
  const r = new GsiSelfResolver()

  it('defers when GSI is undefined', async () => {
    await expect(r.resolve(ctx())).resolves.toBeNull()
  })

  it('defers when GSI has no hero AND no accountid', async () => {
    await expect(r.resolve(ctx({ hero: {}, map: {}, player: {} }))).resolves.toBeNull()
  })

  it('claims when only hero is set', async () => {
    const out = await r.resolve(ctx({ hero: { id: 14 }, map: {}, player: {} }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers.length).toBe(1)
    expect(out?.matchPlayers[0].heroid).toBe(14)
  })

  it('claims when only accountid is set', async () => {
    const out = await r.resolve(ctx({ hero: undefined, map: {}, player: { accountid: '111' } }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers[0].accountid).toBe(111)
  })

  it('NaN accountid is treated as missing (resolved to 0)', async () => {
    const out = await r.resolve(ctx({ hero: { id: 14 }, map: {}, player: { accountid: 'bogus' } }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers[0].accountid).toBe(0)
  })
})
