import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import supabase from '../db'
import { getActiveUsers } from '../dota/dotaGSIClients'

async function getChatClient() {
  if (!process.env.TWITCH_ACCESS_TOKEN || !process.env.TWITCH_REFRESH_TOKEN) {
    throw new Error('Missing twitch tokens')
  }

  // Get latest twitch access token that isn't expired
  const { data: twitchTokens, error } = await supabase
    .from('twitch_tokens')
    .select()
    .order('id', { ascending: false })
    .limit(1)
    .single()

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
      onRefresh: async ({ refreshToken, accessToken }) => {
        await supabase.from('twitch_tokens').upsert({ refreshToken, accessToken }).select()

        console.log('Refreshed twitch access token')
      },
    },
    {
      expiresIn: 86400, // 1 day
      obtainmentTimestamp: Date.now(),
      accessToken: twitchTokens.accessToken || process.env.TWITCH_ACCESS_TOKEN,
      refreshToken: twitchTokens.refreshToken || process.env.TWITCH_REFRESH_TOKEN,
    },
  )
  console.log('Retrieved twitch access tokens')

  const chatClient = new ChatClient({
    authProvider,
    channels: () => getActiveUsers().map((user) => user.name),
  })

  await chatClient.connect()
  console.log('Connected to chat client')

  return chatClient
}

// Actually no \/ bot should only join channels that have OBS and GSI open
// When a new user registers and the server is still alive, make the chat client join their channel
// const channel = supabase.channel('db-changes')
// channel
//   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
//     console.log('New user to send bot to: ', payload)
//     chatClient.join(payload.new.name)
//   })
//   .subscribe()

export default getChatClient