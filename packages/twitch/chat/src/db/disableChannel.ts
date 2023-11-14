import supabase from './supabase.js'

export async function disableChannel(channel: string) {
  const name = channel.replace('#', '')
  const { data: user } = await supabase
    .from('users')
    .select(
      `
    id,
    settings (
      key,
      value
    )
    `,
    )
    .eq('name', name)
    .single()

  if (!user) {
    console.log('Failed to find user', name)
    return
  }

  if (user.settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    console.log('User already disabled', name)
    return
  }

  console.log('Disabling user', name)
  await supabase.from('settings').upsert(
    {
      userId: user.id,
      key: 'commandDisable',
      value: true,
    },
    {
      onConflict: 'userId, key',
    },
  )
}
