import { RefreshingAuthProvider } from '@twurple/auth'

import { prisma } from '../../db/prisma.js'
import { hasTokens } from './hasTokens.js'

export const getChannelAuthProvider = async function (twitchId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = await prisma.account.findFirst({
    select: {
      refresh_token: true,
      access_token: true,
    },
    where: {
      provider: 'twitch',
      providerAccountId: twitchId,
    },
  })

  if (!twitchTokens?.access_token || !twitchTokens.refresh_token) {
    console.log('[TWITCHSETUP] Missing twitch tokens', twitchId)
    return {}
  }

  console.log('[TWITCHSETUP] Retrieved twitch access tokens', twitchId)

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
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
      expiresIn: 86400,
      obtainmentTimestamp: Date.now(),
      accessToken: twitchTokens.access_token,
      refreshToken: twitchTokens.refresh_token,
    },
  )

  return authProvider
}
