import { RefreshingAuthProvider } from '@twurple/auth'

import { findUserByTwitchId } from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { hasTokens } from './hasTokens.js'

export const getChannelAuthProvider = function (channelId: string) {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const twitchTokens = findUserByTwitchId(channelId)

  if (!twitchTokens?.Account?.[0]?.access_token || !twitchTokens.Account[0].refresh_token) {
    logger.info('[TWITCHSETUP] Missing twitch tokens', { channelId })
    return {}
  }

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
      accessToken: twitchTokens.Account[0].access_token,
      refreshToken: twitchTokens.Account[0].refresh_token,
    },
  )

  return { providerAccountId: twitchTokens.Account[0].providerAccountId, authProvider }
}
