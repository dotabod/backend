import { logger, supabase } from '@dotabod/shared-utils'

type AccountRow = {
  providerAccountId: string | null
  users: { followers: number | null } | { followers: number | null }[] | null
}

function pluckProviderIds(rows: AccountRow[] | null): string[] {
  return (rows ?? []).map((r) => r.providerAccountId).filter((id): id is string => Boolean(id))
}

export async function getAllAccountIds(): Promise<string[]> {
  logger.info('[TWITCHSETUP] Running getAllAccountIds')

  const { data, error } = await supabase
    .from('accounts')
    .select('providerAccountId, users!inner(followers)')
    .eq('provider', 'twitch')
    .ilike('scope', '%channel:bot%')
    .order('followers', { referencedTable: 'users', ascending: false, nullsFirst: false })

  if (error) {
    logger.error('[TWITCHEVENTS] getAllAccountIds query failed', { error: error.message })
    throw error
  }

  const providerIds = pluckProviderIds(data as AccountRow[] | null)

  if (providerIds.length < 10) {
    logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels (all accounts)`, {
      providerIds,
    })
  }
  logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels (all accounts)`)
  return providerIds
}

export async function getAccountIds(): Promise<string[]> {
  logger.info('[TWITCHSETUP] Running getAccountIds')

  const { data, error } = await supabase
    .from('accounts')
    .select('providerAccountId, users!inner(followers)')
    .eq('provider', 'twitch')
    .neq('requires_refresh', true)
    .ilike('scope', '%channel:bot%')
    .order('followers', { referencedTable: 'users', ascending: false, nullsFirst: false })

  if (error) {
    logger.error('[TWITCHEVENTS] getAccountIds query failed', { error: error.message })
    throw error
  }

  const providerIds = pluckProviderIds(data as AccountRow[] | null)

  if (providerIds.length < 10) {
    logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels`, { providerIds })
  }
  logger.info(`[TWITCHEVENTS] joining ${providerIds.length} channels`)
  return providerIds
}
