import { RefreshingAuthProvider } from '@twurple/auth'

import findUser from '../../dota/lib/connectedStreamers.js'
import { hasTokens } from './hasTokens.js'

export const getChannelAuthProvider = async function (channel: string, userId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = await findUser(userId)

  if (!twitchTokens?.Account?.access_token || !twitchTokens.Account.refresh_token) {
    console.log('[TWITCHSETUP]', 'Missing twitch tokens', channel)
    return {}
  }

  console.log('[TWITCHSETUP]', 'Retrieved twitch access tokens', channel)

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
      accessToken: twitchTokens.Account.access_token,
      refreshToken: twitchTokens.Account.refresh_token,
    },
  )

  return { providerAccountId: twitchTokens.Account.providerAccountId, authProvider }
}
