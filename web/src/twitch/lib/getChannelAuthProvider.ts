import { RefreshingAuthProvider } from '@twurple/auth'

import findUser from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { hasTokens } from './hasTokens.js'

export const getChannelAuthProvider = function (userId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = findUser(userId)

  if (!twitchTokens?.Account?.access_token || !twitchTokens.Account.refresh_token) {
    logger.info('[TWITCHSETUP]', 'Missing twitch tokens', userId)
    return {}
  }

  logger.info('[TWITCHSETUP]', 'Retrieved twitch access tokens', twitchTokens.name)

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
