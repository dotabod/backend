import supabase from '../../db/supabase.js'

export async function getBotTokens_DEV_ONLY() {
  const twitchBotProviderId = process.env.TWITCH_BOT_PROVIDERID
  if (!twitchBotProviderId) {
    throw new Error('Environment variable TWITCH_BOT_PROVIDERID is not defined.')
  }

  const { data } = await supabase
    .from('accounts')
    .select('refresh_token, access_token, expires_in, scope, obtainment_timestamp')
    .eq('provider', 'twitch')
    .eq('providerAccountId', twitchBotProviderId)
    .single()

  return data
}
