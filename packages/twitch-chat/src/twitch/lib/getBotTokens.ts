import supabase from '../../db/supabase.js'

export async function getBotTokens() {
  const { data, error } = await supabase
    .from('accounts')
    .select('refresh_token, access_token, expires_in, scope, obtainment_timestamp')
    .eq('provider', 'twitch')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .eq('providerAccountId', process.env.TWITCH_BOT_PROVIDERID!)
    .single()

  return data
}
