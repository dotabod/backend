import supabase from '../../db/supabase.js'

export async function getChannels(provider: 'twitch' | 'kick' | 'youtube') {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'
  const devChannels = process.env.DEV_CHANNELS?.split(',') ?? []
  const users: {
    name: string | null
    youtube: string | null
    kick: number | null
    accounts: { access_token: string; refresh_token: string }[]
  }[] = []

  const pageSize = 1000
  let offset = 0
  let moreDataExists = true

  while (moreDataExists) {
    let query = supabase.from('users').select(
      `
        name,
        youtube,
        kick,
        accounts (
          access_token,
          provider,
          refresh_token
        )
      `,
    )

    if (provider === 'twitch') {
      if (isDevMode) query = query.in('name', devChannels)
      else query = query.not('name', 'in', `(${process.env.DEV_CHANNELS})`)
    }

    // twitch is just the `name` column
    if (provider && provider !== 'twitch') {
      query = query.not(provider, 'is', null)
    }

    query = query.order('followers', { ascending: false, nullsFirst: false })

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
