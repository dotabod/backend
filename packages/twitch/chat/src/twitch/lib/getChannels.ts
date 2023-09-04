import supabase from '../../db/supabase.js'

export async function getChannels(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'
  let users: string[] = []

  if (isDevMode) {
    const { data } = await supabase
      .from('users')
      .select('name')
      .in('name', process.env.DEV_CHANNELS?.split(',') ?? [])
      .order('followers', { ascending: false, nullsFirst: false })
    users = data?.map((user) => user.name as string) ?? users
  } else {
    const { data } = await supabase
      .from('users')
      .select('name')
      .not('name', 'in', `(${process.env.DEV_CHANNELS})`)
      .order('followers', { ascending: false, nullsFirst: false })

    users = data?.map((user) => user.name as string) ?? users
  }

  console.log('joining', users.length, 'channels')

  return users
}
