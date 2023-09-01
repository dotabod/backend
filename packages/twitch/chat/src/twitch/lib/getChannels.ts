import supabase from '../../db/supabase.js'

export async function getChannels(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'

  if (isDevMode) {
    const { data: users, error } = await supabase
      .from('user')
      .select('name')
      .in('name', process.env.DEV_CHANNELS?.split(',') ?? [])
      .order('followers', { ascending: false })
    return users ? users.map((user) => `${user.name}`) : []
  }

  const queryFilter = {
    name: {
      notIn: process.env.DEV_CHANNELS?.split(',') ?? [],
    },
  }

  const { data: users } = await supabase
    .from('user')
    .select('name')
    .not('name', 'in', process.env.DEV_CHANNELS?.split(',') ?? [])
    .order('followers', { ascending: false })

  return users ? users.map((user) => `${user.name}`) : []
}
