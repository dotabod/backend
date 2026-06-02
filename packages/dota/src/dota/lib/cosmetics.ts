import COSMETICS from 'dotaconstants/build/cosmetics.json' with { type: 'json' }

// One equipped cosmetic, resolved from a GSI wearable definition index.
export interface ResolvedCosmetic {
  defindex: number
  name: string
  slot: string
  rarity?: string
  marketHashName?: string
  marketable: boolean
  icon?: string
}

type CosmeticMeta = Omit<ResolvedCosmetic, 'defindex'>
const cosmetics = COSMETICS as Record<string, CosmeticMeta>

// Turn the GSI `wearables` block ({ wearable0: 5867, style0: 1, ... }) into the
// hero's equipped cosmetics. Defindexes absent from cosmetics.json are default
// model parts (e.g. Invoker's base arms) and are skipped, leaving only the
// player-equipped wearables.
export function resolveCosmetics(wearables?: Record<string, number>): ResolvedCosmetic[] {
  if (!wearables) return []

  const items: ResolvedCosmetic[] = []
  for (const [key, defindex] of Object.entries(wearables)) {
    if (!/^wearable\d+$/.test(key)) continue
    if (typeof defindex !== 'number') continue

    const meta = cosmetics[String(defindex)]
    if (!meta) continue

    items.push({ defindex, ...meta })
  }

  return items
}
