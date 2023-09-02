import supabase from '../../db/supabase.js'

export async function getChannels(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'

  if (isDevMode) {
    console.log(process.env.DEV_CHANNELS?.split(','))
    const { data: users, error } = await supabase
      .from('users')
      .select('name')
      .in('name', process.env.DEV_CHANNELS?.split(',') ?? [])
      .order('followers', { ascending: false, nullsFirst: false })
    console.log({ users, error })
    return users ? users.map((user) => `${user.name}`) : []
  }

  const { data: users } = await supabase
    .from('users')
    .select('name')
    .not('name', 'in', process.env.DEV_CHANNELS?.split(',') ?? [])
    .order('followers', { ascending: false, nullsFirst: false })

  return users ? users.map((user) => `${user.name}`) : []
}
