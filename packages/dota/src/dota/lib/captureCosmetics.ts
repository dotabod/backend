import { type Json, supabase } from '@dotabod/shared-utils'

import type { SocketClient } from '../../types'
import { type ResolvedCosmetic, resolveCosmetics } from './cosmetics'
import { getHeroNameOrColor } from './heroes'

// Resolve the played hero's equipped cosmetics from live GSI and snapshot them
// to cosmetic_loadouts (one row per user+hero) so dotabod.com/<name>/set can render
// the streamer's collection later. Replaying a hero refreshes only that hero's row.
// Returns the resolved items, or [] when there's no hero/match or no real cosmetics
// to capture (nothing is written in that case).
export async function captureCosmetics(client: SocketClient): Promise<ResolvedCosmetic[]> {
  const heroId = client.gsi?.hero?.id
  const matchId = client.gsi?.map?.matchid
  if (!matchId || !heroId || heroId <= 0) return []

  const items = resolveCosmetics(client.gsi?.wearables)
  if (!items.length) return []

  await supabase.from('cosmetic_loadouts').upsert(
    {
      userId: client.token,
      matchId: String(matchId),
      heroId,
      heroName: getHeroNameOrColor(heroId),
      items: items as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'userId,heroId' },
  )

  return items
}
