import { RefreshingAuthProvider } from '@twurple/auth'
import { hasTokens } from './twitch/lib/hasTokens'
import { logger } from './twitch/lib/logger'
import supabase from './db/supabase'

let authProvider: RefreshingAuthProvider | null = null

export const getAuthProvider = () => {
  if (!hasTokens) throw new Error('Missing twitch tokens')
  if (authProvider) return authProvider

  authProvider = new RefreshingAuthProvider({
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
  })

  authProvider.onRefreshFailure(async (twitchId) => {
    logger.error('[TWITCHSETUP] Failed to refresh twitch tokens', { twitchId })

    await supabase
      .from('accounts')
      .update({
        requires_refresh: true,
        updated_at: new Date().toISOString(),
      })
      .eq('providerAccountId', twitchId)
      .eq('provider', 'twitch')
  })

  authProvider.onRefresh(async (twitchId, newTokenData) => {
    logger.info('[TWITCHSETUP] Refreshing twitch tokens', { twitchId })

    await supabase
      .from('accounts')
      .update({
        requires_refresh: false,
        scope: newTokenData.scope.join(' '),
        access_token: newTokenData.accessToken,
        refresh_token: newTokenData.refreshToken!,
        expires_at: Math.floor(
          new Date(newTokenData.obtainmentTimestamp).getTime() / 1000 +
            (newTokenData.expiresIn ?? 0),
        ),
        expires_in: newTokenData.expiresIn ?? 0,
        updated_at: new Date().toISOString(),
        obtainment_timestamp: new Date(newTokenData.obtainmentTimestamp).toISOString(),
      })
      .eq('providerAccountId', twitchId)
      .eq('provider', 'twitch')
  })

  return authProvider
}
