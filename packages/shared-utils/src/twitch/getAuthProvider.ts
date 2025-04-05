import { RefreshingAuthProvider } from '@twurple/auth'
import { logger } from '@dotabod/shared-utils'
import { hasTokens } from './hasTokens.js'
import { getSupabaseClient } from '../db/supabase.js'

// Singleton instance of the auth provider
let authProvider: RefreshingAuthProvider | null = null

/**
 * Get or create a singleton instance of the Twitch auth provider
 * @returns RefreshingAuthProvider instance
 */
export const getAuthProvider = () => {
  // Ensure Twitch credentials are available
  if (!hasTokens) throw new Error('Missing Twitch tokens')

  // Return existing instance if available
  if (authProvider) return authProvider

  // Create new auth provider instance
  authProvider = new RefreshingAuthProvider({
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
  })

  // Handle token refresh failures
  authProvider.onRefreshFailure(async (twitchId) => {
    logger.error('[TWITCH] Failed to refresh tokens', { twitchId })

    const supabase = getSupabaseClient()
    await supabase
      .from('accounts')
      .update({
        requires_refresh: true,
        updated_at: new Date().toISOString(),
      })
      .eq('providerAccountId', twitchId)
      .eq('provider', 'twitch')
  })

  // Handle successful token refreshes
  authProvider.onRefresh(async (twitchId, newTokenData) => {
    logger.info('[TWITCH] Refreshing tokens', { twitchId })

    const supabase = getSupabaseClient()
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
