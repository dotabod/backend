import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import supabase from '../db/supabase'
import { getActiveUsers } from '../dota/dotaGSIClients'

// Get latest twitch access token that isn't expired
const { data: twitchTokens, error } = await supabase
  .from('twitch_tokens')
  .select()
  .order('id', { ascending: false })
  .limit(1)
  .single()

export const authProvider = new RefreshingAuthProvider(
  {
    clientId: process.env.TWITCH_CLIENT_ID as string,
    clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    onRefresh: async ({ refreshToken, accessToken }) => {
      await supabase.from('twitch_tokens').upsert({ refreshToken, accessToken }).select()

      console.log('Refreshed twitch access token')
    },
  },
  {
    accessToken: twitchTokens.accessToken || (process.env.TWITCH_ACCESS_TOKEN as string),
    refreshToken: twitchTokens.refreshToken || (process.env.TWITCH_REFRESH_TOKEN as string),
  },
)

const chatClient = new ChatClient({
  authProvider,
  channels: () => getActiveUsers().map((user) => user.name),
})

// Actually no \/ bot should only join channels that have OBS and GSI open
// When a new user registers and the server is still alive, make the chat client join their channel
// const channel = supabase.channel('db-changes')
// channel
//   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
//     console.log('New user to send bot to: ', payload)
//     chatClient.join(payload.new.name)
//   })
//   .subscribe()

export default chatClient