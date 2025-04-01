import supabase from '../../db/supabase.js'

export async function getTwitchTokens(providerId?: string) {
  const lookupProviderId = providerId || process.env.TWITCH_BOT_PROVIDERID

  if (!lookupProviderId) throw new Error('Missing bot provider id (TWITCH_BOT_PROVIDERID)')

  const { data, error } = await supabase
    .from('accounts')
    .select(
      'refresh_token, access_token, expires_in, scope, obtainment_timestamp, requires_refresh',
    )
    .eq('provider', 'twitch')
    .eq('providerAccountId', lookupProviderId)
    .single()

  if (error) {
    console.error(error)
    throw new Error('Error fetching bot tokens')
  }

  return data
}
