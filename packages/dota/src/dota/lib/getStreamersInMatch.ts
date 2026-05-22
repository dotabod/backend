import { supabase } from '@dotabod/shared-utils'
import type { Packet, Players } from '../../types'
import { getAccountsFromMatch } from './getAccountsFromMatch'

// Counts distinct OTHER Dotabod users in the current match. Names are never returned — only an
// anonymized count — to avoid cross-chat witch-hunts.
//
// Two sources, unioned + deduped by userId:
//   1. `matches` table — one row per live streamer per match (inserted in openBets, GSIHandler.ts).
//      Reliable for ALL MMRs and the only source that catches a streamer's own pub game, since most
//      pub games never land in `delayedGames`.
//   2. Roster lookup — only contributes for SourceTV-listed games (the games the GC broadcasts as
//      spectatable, which is all `delayedGames` carries now). Catches registered Dotabod users in the
//      roster even if they aren't currently live. Adds nothing for ordinary pub games (no doc).
export async function getStreamersInMatch({
  gsi,
  players,
  matchId = gsi?.map?.matchid,
  excludeUserId,
}: {
  gsi?: Packet
  players?: Players
  matchId?: string
  excludeUserId: string
}): Promise<number> {
  const userIds = new Set<string>()

  // Source 1: live Dotabod streamers tracked in this exact match.
  if (matchId && matchId !== '0') {
    const { data } = await supabase.from('matches').select('userId').eq('matchId', `${matchId}`)
    for (const row of data ?? []) {
      if (row.userId) userIds.add(row.userId)
    }
  }

  // Source 2: registered Dotabod users present in the (SourceTV) roster.
  const accountIds = (
    players?.length
      ? players.map((p) => p.accountid)
      : (await getAccountsFromMatch({ gsi })).accountIds
  ).filter((id): id is number => !!id && id !== 0)
  if (accountIds.length) {
    const { data } = await supabase
      .from('steam_accounts')
      .select('userId')
      .in('steam32Id', accountIds)
    for (const row of data ?? []) {
      if (row.userId) userIds.add(row.userId)
    }
  }

  userIds.delete(excludeUserId)
  return userIds.size
}
