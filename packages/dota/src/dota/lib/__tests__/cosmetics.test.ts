import { describe, expect, it } from 'vitest'

import { resolveCosmetics } from '../cosmetics.ts'

// Wearables block from the gameEnd fixture (an Invoker loadout): a mix of
// player-equipped cosmetics and default/base model parts.
const FIXTURE_WEARABLES: Record<string, number> = {
  wearable0: 5867, // Iceforged Hair (head, marketable)
  wearable1: 23_683, // 10th Anniversary Heaven-Piercing Pauldrons (shoulder, not marketable)
  wearable15: 766,
  wearable2: 98, // base part
  wearable25: 683,
  wearable3: 48, // base part
  wearable4: 4289, // Bracers of Profound Perfection (arms, marketable)
  wearable5: 8626, // default_item
  wearable6: 6079, // Wraps of the Eastern Range (belt, marketable)
  wearable7: 8632,
  wearable8: 13_043,
}

describe(resolveCosmetics, () => {
  it('returns only player-equipped wearables, dropping base/default parts', () => {
    const items = resolveCosmetics(FIXTURE_WEARABLES)
    const defindexes = items.map((i) => i.defindex).sort((a, b) => a - b)
    expect(defindexes).toStrictEqual([4289, 5867, 6079, 23_683])
  })

  it('resolves name, slot, rarity, and marketability', () => {
    const items = resolveCosmetics(FIXTURE_WEARABLES)
    const hair = items.find((i) => i.defindex === 5867)
    expect(hair).toMatchObject({ marketable: true, name: 'Iceforged Hair', slot: 'head' })
    expect(hair?.icon).toBeTruthy()

    // Untradable item: not marketable (so no market link), but the VPK-derived
    // Steam CDN icon still covers it — that's the whole point of the VPK pass.
    const pauldrons = items.find((i) => i.defindex === 23_683)
    expect(pauldrons).toMatchObject({ marketable: false, slot: 'shoulder' })
    expect(pauldrons?.icon).toContain('/apps/570/icons/')
  })

  it('ignores style entries', () => {
    const items = resolveCosmetics({ style0: 1, wearable0: 5867 })
    expect(items).toHaveLength(1)
    expect(items[0].defindex).toBe(5867)
  })

  it('returns an empty array when wearables are missing', () => {
    expect(resolveCosmetics()).toStrictEqual([])
    expect(resolveCosmetics({})).toStrictEqual([])
  })
})
