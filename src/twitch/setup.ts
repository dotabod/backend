import { ChatClient } from '@twurple/chat'
import { AuthProvider, RefreshingAuthProvider } from '@twurple/auth'
import supabase from '../db'
import { getActiveUsers } from '../dota/dotaGSIClients'

export async function getAuthProvider() {
  if (!process.env.TWITCH_ACCESS_TOKEN || !process.env.TWITCH_REFRESH_TOKEN) {
    throw new Error('Missing twitch tokens')
  }

  let twitchTokens
  // Get latest twitch access token that isn't expired
  const { data, error } = await supabase
    .from('twitch_tokens')
    .select()
    .order('id', { ascending: false })
    .limit(1)
    .single()
  twitchTokens = data

  console.log('Retrieved twitch access tokens', twitchTokens)

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
    {
      expiresIn: 86400, // 1 day
      obtainmentTimestamp: Date.now(),
      accessToken: twitchTokens.access_token || process.env.TWITCH_ACCESS_TOKEN,
      refreshToken: twitchTokens.refresh_token || process.env.TWITCH_REFRESH_TOKEN,
    },
  )

  return authProvider
}

export async function getChannelAuthProvider(channel: string, userId: string) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    throw new Error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET')
  }

  const { data: twitchTokens } = await supabase
    .from('accounts')
    .select('refresh_token, access_token, providerAccountId')
    .eq('userId', userId)
    .limit(1)
    .single()

  if (!twitchTokens?.access_token || !twitchTokens?.refresh_token) {
    console.log('Missing twitch tokens', channel)
    return {}
  }

  console.log('Retrieved twitch access tokens', channel)

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
    {
      scope: [
        'openid',
        'user:read:email',
        'channel:manage:predictions',
        'channel:manage:polls',
        'channel:read:predictions',
        'channel:read:polls',
      ],
      expiresIn: 86400, // 1 day
      obtainmentTimestamp: Date.now(),
      accessToken: twitchTokens.access_token,
      refreshToken: twitchTokens.refresh_token,
    },
  )

  return { providerAccountId: twitchTokens?.providerAccountId, authProvider }
}

async function getChannels() {
  // getActiveUsers().map((user) => user.name)
  const names = await supabase.from('users').select('name')
  const channels = []
  if (names?.data) {
    const namesArray = names.data.map((user) => user.name)
    channels.push(...namesArray)
  }

  return channels
}

export async function getChatClient() {
  const chatClient = new ChatClient({
    authProvider: await getAuthProvider(),
    channels: getChannels,
  })

  await chatClient.connect()
  console.log('Connected to chat client', chatClient.isConnected)

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
