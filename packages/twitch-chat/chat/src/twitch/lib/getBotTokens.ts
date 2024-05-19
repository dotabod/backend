import supabase from '../../db/supabase.js'

export async function getBotTokens() {
  if (!process.env.TWITCH_BOT_PROVIDERID)
    throw new Error('Missing bot provider id (TWITCH_BOT_PROVIDERID)')

  const { data, error } = await supabase
    .from('accounts')
    .select('refresh_token, access_token, expires_in, scope, obtainment_timestamp')
    .eq('provider', 'twitch')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .eq('providerAccountId', process.env.TWITCH_BOT_PROVIDERID)
    .single()

  if (error) {
    console.error(error)
    throw new Error('Error fetching bot tokens')
  }

  return data
}
