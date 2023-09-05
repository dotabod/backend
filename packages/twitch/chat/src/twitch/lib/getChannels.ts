import supabase from '../../db/supabase.js'

export async function getChannels(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const isDevMode = process.env.NODE_ENV === 'development'
  const devChannels = process.env.DEV_CHANNELS?.split(',') ?? []
  const users: string[] = []

  const pageSize = 1000
  let offset = 0
  let moreDataExists = true

  while (moreDataExists) {
    const baseQuery = supabase
      .from('users')
      .select('name')
      .order('followers', { ascending: false, nullsFirst: false })

    const query = isDevMode
      ? baseQuery.in('name', devChannels)
      : baseQuery.not('name', 'in', `(${process.env.DEV_CHANNELS})`)

    const { data } = await query.range(offset, offset + pageSize - 1)

    if (data?.length) {
      users.push(...data.map((user) => user.name as string))
      offset += pageSize
    } else {
      moreDataExists = false
    }
  }

  // Filter out undefined values, if any.
  const filteredUsers = users.filter(Boolean)

  console.log('joining', filteredUsers.length, 'channels')

  return filteredUsers
}
