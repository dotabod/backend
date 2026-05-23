import { describe, expect, it } from 'vite-plus/test'
import { GsiSelfResolver } from '../../resolvers/GsiSelfResolver'

const ctx = (gsi: unknown) => ({ gsi: gsi as never, matchId: '12345' })

describe('GsiSelfResolver', () => {
  const r = new GsiSelfResolver()

  it('defers when GSI is undefined', async () => {
    expect(await r.resolve(ctx(undefined))).toBeNull()
  })

  it('defers when GSI has no hero AND no accountid', async () => {
    expect(await r.resolve(ctx({ map: {}, player: {}, hero: {} }))).toBeNull()
  })

  it('claims when only hero is set', async () => {
    const out = await r.resolve(ctx({ map: {}, player: {}, hero: { id: 14 } }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers.length).toBe(1)
    expect(out?.matchPlayers[0].heroid).toBe(14)
  })

  it('claims when only accountid is set', async () => {
    const out = await r.resolve(ctx({ map: {}, player: { accountid: '111' }, hero: undefined }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers[0].accountid).toBe(111)
  })

  it('NaN accountid is treated as missing (resolved to 0)', async () => {
    const out = await r.resolve(ctx({ map: {}, player: { accountid: 'bogus' }, hero: { id: 14 } }))
    expect(out?.source).toBe('gsi-self')
    expect(out?.matchPlayers[0].accountid).toBe(0)
  })
})
