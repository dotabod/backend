import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import { mainChannel } from '../utils/constants.js'
import supabase from '../db/supabase.js'

// Get latest twitch access token that isn't expired
const { data: twitchTokens, error } = await supabase
  .from('twitch_tokens')
  .select()
  .order('id', { ascending: false })
  .limit(1)
  .single()

export const authProvider = new RefreshingAuthProvider(
  {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    onRefresh: async ({ refreshToken, accessToken }) => {
      await supabase.from('twitch_tokens').upsert({ refreshToken, accessToken }).select()

      console.log('Refreshed twitch access token')
    },
  },
  {
    accessToken: twitchTokens.accessToken || process.env.TWITCH_ACCESS_TOKEN,
    refreshToken: twitchTokens.refreshToken || process.env.TWITCH_REFRESH_TOKEN,
  },
)

export default new ChatClient({
  authProvider,
  channels: [mainChannel],
})
