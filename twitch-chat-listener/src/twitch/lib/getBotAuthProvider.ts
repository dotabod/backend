import { RefreshingAuthProvider } from '@twurple/auth'

import { getBotTokens } from './getBotTokens.js'
import { hasTokens } from './hasTokens.js'

export const getBotAuthProvider = async function () {
  if (!hasTokens) {
    throw new Error('Missing twitch tokens')
  }
  const botTokens = await getBotTokens()

  if (!botTokens?.access_token || !botTokens.refresh_token) {
    console.log('[TWITCHSETUP] Missing bot tokens', {
      twitchId: process.env.TWITCH_BOT_PROVIDERID,
    })
    return false
  }

  const authProvider = new RefreshingAuthProvider(
    {
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    },
    {
      scope: botTokens.scope?.split(' ') ?? [],
      expiresIn: botTokens.expires_in,
      obtainmentTimestamp: botTokens.obtainment_timestamp ?? 0,
      accessToken: botTokens.access_token,
      refreshToken: botTokens.refresh_token,
    },
  )

  return authProvider
}
