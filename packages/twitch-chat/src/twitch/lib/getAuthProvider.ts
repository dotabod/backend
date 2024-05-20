import { RefreshingAuthProvider } from '@twurple/auth'

import supabase from '../../db/supabase.js'
import { hasTokens } from './hasTokens.js'

let authProvider: RefreshingAuthProvider | null = null

export const getAuthProvider = () => {
  if (!hasTokens) throw new Error('Missing twitch tokens')
  if (authProvider) return authProvider

  authProvider = new RefreshingAuthProvider({
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    onRefresh: async (twitchId, newTokenData) => {
      console.log('[TWITCHSETUP] Refreshing twitch tokens', { twitchId })

      if (!newTokenData.refreshToken) throw new Error('Missing refresh token')

      await supabase
        .from('accounts')
        .update({
          scope: newTokenData.scope.join(' '),
          access_token: newTokenData.accessToken,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          refresh_token: newTokenData.refreshToken,
          expires_at: Math.floor(
            new Date(newTokenData.obtainmentTimestamp).getTime() / 1000 +
              (newTokenData.expiresIn ?? 0),
          ),
          expires_in: newTokenData.expiresIn ?? 0,
          obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp).toISOString(),
        })
        .eq('providerAccountId', twitchId)
    },
  })

  return authProvider
}
