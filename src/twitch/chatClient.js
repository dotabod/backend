import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
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

async function getChannels() {
  const names = await supabase.from('users').select('name')
  const channels = []
  if (names?.data) {
    const namesArray = names.data.map((user) => user.name)
    channels.push(...namesArray)
  }

  return channels
}

const chatClient = new ChatClient({
  authProvider,
  channels: getChannels,
})

// When a new user registers and the server is still alive, make the chat client join their channel
const channel = supabase.channel('db-changes')
channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    console.log('New user to send bot to: ', payload)
    chatClient.join(payload.new.name)
  })
  .subscribe()

export default chatClient