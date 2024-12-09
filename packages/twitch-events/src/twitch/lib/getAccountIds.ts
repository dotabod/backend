import supabase from '../../db/supabase.js'
import { logger } from './logger.js'

export async function getAccountIds(): Promise<string[]> {
  logger.info('[TWITCHSETUP] Running getAccountIds')

  const providerIds: string[] = []

  const pageSize = 1000
  let offset = 0
  let moreDataExists = true

  while (moreDataExists) {
    const baseQuery = supabase
      .from('users')
      .select('id,accounts(providerAccountId)')
      .neq('accounts.requires_refresh', true)
      .eq('accounts.provider', 'twitch')
      .contains('accounts.scope', ['channel:bot'])
      .order('followers', { ascending: false, nullsFirst: false })

    const { data } = await baseQuery.range(offset, offset + pageSize - 1)

    if (data?.length) {
      const newProviderIds = data.map((user) => {
        return Array.isArray(user?.accounts)
          ? user?.accounts[0]?.providerAccountId
          : (user?.accounts?.providerAccountId as string)
      })

      providerIds.push(...newProviderIds)
      offset += pageSize
    } else {
      moreDataExists = false
    }
  }

  // Filter out undefined values, if any.
  const filteredProviderIds = providerIds.filter(Boolean)

  if (filteredProviderIds.length < 10) {
    logger.info(`[TWITCHEVENTS] joining ${filteredProviderIds.length} channels`, {
      providerIds: filteredProviderIds,
    })
  }

  logger.info(`[TWITCHEVENTS] joining ${filteredProviderIds.length} channels`)
  return filteredProviderIds
}
