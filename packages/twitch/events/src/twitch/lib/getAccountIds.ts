import supabase from '../../db/supabase.js'

export async function getAccountIds(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getAccountIds')

  const devIds = process.env.DEV_CHANNELIDS?.split(',') ?? []
  const isDevMode = process.env.NODE_ENV === 'development'
  let providerIds: string[] = []

  if (isDevMode) {
    if (!devIds.length) throw new Error('Missing DEV_CHANNELIDS')

    const { data } = await supabase
      .from('users')
      .select('id,accounts(providerAccountId)')
      .in('name', process.env.DEV_CHANNELS?.split(',') ?? [])
      .neq('accounts.requires_refresh', true)
      .order('followers', { ascending: false, nullsFirst: false })

    providerIds =
      data?.map((user) => user?.accounts?.[0]?.providerAccountId as string) ?? providerIds
  } else {
    const { data } = await supabase
      .from('users')
      .select('id,accounts(providerAccountId)')
      .not('name', 'in', `(${process.env.DEV_CHANNELS})`)
      .neq('accounts.requires_refresh', true)
      .order('followers', { ascending: false, nullsFirst: false })

    providerIds =
      data?.map((user) => user?.accounts?.[0]?.providerAccountId as string) ?? providerIds
  }

  providerIds = providerIds.filter(Boolean)
  console.log('joining', providerIds.length, 'channels')

  return providerIds
}
