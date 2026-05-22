import { supabase } from '@dotabod/shared-utils'
import type { Packet, Players } from '../../types'
import { getAccountsFromMatch } from './getAccountsFromMatch'

// Counts distinct Dotabod users in the current match other than the broadcaster.
// Names are never returned — only an anonymized count — to avoid cross-chat witch-hunts.
export async function getStreamersInMatch({
  gsi,
  players,
  excludeUserId,
}: {
  gsi?: Packet
  players?: Players
  excludeUserId: string
}): Promise<number> {
  const accountIds = (
    players?.length
      ? players.map((p) => p.accountid)
      : (await getAccountsFromMatch({ gsi })).accountIds
  ).filter((id): id is number => !!id && id !== 0)

  if (!accountIds.length) return 0

  const { data } = await supabase
    .from('steam_accounts')
    .select('userId')
    .in('steam32Id', accountIds)

  const others = new Set(
    (data ?? []).map((row) => row.userId).filter((userId) => userId && userId !== excludeUserId),
  )
  return others.size
}
