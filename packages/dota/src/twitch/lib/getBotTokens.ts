import supabase from '../../db/supabase.js'

export async function getBotTokens_DEV_ONLY() {
  if (!process.env.TWITCH_BOT_PROVIDERID) {
    throw new Error('Missing TWITCH_BOT_PROVIDERID')
  }

  const { data } = await supabase
    .from('accounts')
    .select('refresh_token, access_token, expires_in, scope, obtainment_timestamp')
    .eq('provider', 'twitch')
    .eq('providerAccountId', process.env.TWITCH_BOT_PROVIDERID)
    .single()

  return data
}
