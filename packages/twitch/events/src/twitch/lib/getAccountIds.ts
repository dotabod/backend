import supabase from '../../db/supabase.js'

const dev_channelids = process.env.DEV_CHANNELIDS?.split(',') ?? []
export async function getAccountIds(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getAccountIds')

  if (process.env.NODE_ENV === 'development') {
    if (!dev_channelids.length) throw new Error('Missing DEV_CHANNELIDS')
    return dev_channelids
  }

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .order('followers', { ascending: false, nullsFirst: false })

  const accountIds: string[] = users?.map((user) => user.id as string) ?? []

  return accountIds
}
