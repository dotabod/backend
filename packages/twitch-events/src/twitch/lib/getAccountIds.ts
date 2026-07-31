import { logger, supabase } from '@dotabod/shared-utils'

type AccountRow = {
  providerAccountId: string | null
  users: { followers: number | null } | { followers: number | null }[] | null
}

function pluckProviderIds(rows: AccountRow[] | null): string[] {
  return (rows ?? []).map((r) => r.providerAccountId).filter((id): id is string => Boolean(id))
}

// PostgREST caps unpaginated selects at 1000 rows. Ordering by followers desc
// meant only the top ~1000 most-followed channels were ever health-checked -
// any account below that cutoff could lose a subscription (e.g. a failed,
// non-retried channel.chat.message subscribe) and never get auto-repaired.
// Page through with .range() so every account is covered.
const PAGE_SIZE = 1000

export async function getAccountIds(): Promise<string[]> {
  logger.info('[TWITCHSETUP] Running getAccountIds')

  const providerIds: string[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('accounts')
      .select('providerAccountId, users!inner(followers)')
      .eq('provider', 'twitch')
      .neq('requires_refresh', true)
      .ilike('scope', '%channel:bot%')
      .order('followers', { referencedTable: 'users', ascending: false, nullsFirst: false })
      .order('providerAccountId', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      logger.error('[TWITCHEVENTS] getAccountIds query failed', { error: error.message })
      throw error
    }

    providerIds.push(...pluckProviderIds(data as AccountRow[] | null))

    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  if (providerIds.length < 10) {
    logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels`, { providerIds })
  }
  logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels`)
  return providerIds
}
