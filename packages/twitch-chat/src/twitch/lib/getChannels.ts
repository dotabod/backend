import supabase from '../../db/supabase.js'

export async function getChannels(): Promise<string[]> {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  const users: string[] = []

  const pageSize = 1000
  let offset = 0
  let moreDataExists = true

  while (moreDataExists) {
    const baseQuery = supabase
      .from('users')
      .select('name')
      .order('followers', { ascending: false, nullsFirst: false })

    const { data } = await baseQuery.range(offset, offset + pageSize - 1)

    if (data?.length) {
      users.push(...data.map((user) => user.name))
      offset += pageSize
    } else {
      moreDataExists = false
    }
  }

  // Filter out undefined values, if any.
  const filteredUsers = users.filter(Boolean)

  console.log('joining', filteredUsers.length, 'channels')
  if (filteredUsers.length < 10) {
    console.log(filteredUsers)
  }

  return filteredUsers
}
