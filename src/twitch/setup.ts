import { ChatClient } from '@twurple/chat'
import { RefreshingAuthProvider } from '@twurple/auth'
import findUser, { getActiveUsers } from '../dota/dotaGSIClients'
import prisma from '../db/prisma'

export async function getAuthProvider() {
  if (!process.env.TWITCH_ACCESS_TOKEN || !process.env.TWITCH_REFRESH_TOKEN) {
    throw new Error('Missing twitch tokens')
  }

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID as string,
      clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
    },
    {
      expiresIn: 86400, // 1 day
      obtainmentTimestamp: Date.now(),
      accessToken: process.env.TWITCH_ACCESS_TOKEN,
      refreshToken: process.env.TWITCH_REFRESH_TOKEN,
    },
  )

  return authProvider
}

export async function getChannelAuthProvider(channel: string, userId: string) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    throw new Error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET')
  }

  const twitchTokens = findUser(userId)

  if (!twitchTokens?.account?.access_token || !twitchTokens?.account?.refresh_token) {
    console.log('[TWITCHSETUP]', 'Missing twitch tokens', channel)
    return {}
  }

  console.log('[TWITCHSETUP]', 'Retrieved twitch access tokens', channel)

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
      accessToken: twitchTokens.account.access_token,
      refreshToken: twitchTokens.account.refresh_token,
    },
  )

  return { providerAccountId: twitchTokens.account.providerAccountId, authProvider }
}

async function getChannels() {
  console.log('Running getChannels')

  if (process.env.NODE_ENV === 'development') {
    return process.env.DEV_CHANNELS?.split(',') || []
  }

  return prisma.user
    .findMany({ select: { name: true } })
    .then((users) => users.map((user) => user.name))
}

export async function getChatClient() {
  const chatClient = new ChatClient({
    authProvider: await getAuthProvider(),
    channels: getChannels,
  })

  await chatClient.connect()
  console.log('[TWITCHSETUP]', 'Connected to chat client', chatClient.isConnected)

  return chatClient
}

// Actually no \/ bot should only join channels that have OBS and GSI open
// When a new user registers and the server is still alive, make the chat client join their channel
// const channel = supabase.channel('db-changes')
// channel
//   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
//     console.log('[TWITCHSETUP]','New user to send bot to: ', payload)
//     chatClient.join(payload.new.name)
//   })
//   .subscribe()
