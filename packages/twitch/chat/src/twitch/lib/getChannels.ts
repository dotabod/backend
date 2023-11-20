import supabase from '../../db/supabase.js'

export async function getChannels(provider?: 'twitch' | 'kick' | 'youtube') {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'
  const devChannels = process.env.DEV_CHANNELS?.split(',') ?? []
  const users: { name: string | null; youtube: string | null; kick: number | null }[] = []

  const pageSize = 1000
  let offset = 0
  let moreDataExists = true

  while (moreDataExists) {
    const baseQuery = supabase
      .from('users')
      .select('name,youtube,kick')
      .order('followers', { ascending: false, nullsFirst: false })

    let query = isDevMode
      ? provider === 'twitch'
        ? baseQuery.in('name', devChannels)
        : baseQuery
      : baseQuery.not('name', 'in', `(${process.env.DEV_CHANNELS})`)

    if (provider) {
      query = query.not(provider, 'is', null)
    }

    const { data } = await query.range(offset, offset + pageSize - 1)

    if (data?.length) {
      users.push(...data)
      offset += pageSize
    } else {
      moreDataExists = false
    }
  }

  // Filter out undefined values, if any.
  const filteredUsers = users.filter(Boolean)

  console.log('joining', filteredUsers.length, 'channels for', provider || 'twitch')

  return filteredUsers
}
