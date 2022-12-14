import { RefreshingAuthProvider } from '@twurple/auth'

import { hasTokens } from './hasTokens.js'

export const getAuthProvider = function () {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    },
    {
      expiresIn: 86400,
      obtainmentTimestamp: Date.now(),
      accessToken: process.env.TWITCH_ACCESS_TOKEN ?? '',
      refreshToken: process.env.TWITCH_REFRESH_TOKEN ?? '',
    },
  )

  return authProvider
}
