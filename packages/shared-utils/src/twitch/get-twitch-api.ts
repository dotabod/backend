import { ApiClient } from '@twurple/api'

import { logger } from '../logger'
import { getAuthProvider } from './get-auth-provider'
import { getTwitchTokens } from './get-twitch-tokens'

// Singleton instance of the API client
let apiClient: ApiClient | null = null

/**
 * Gets or creates a Twitch API client for the specified user
 * @param twitchId The Twitch user ID to get tokens for
 * @returns Twitch API client instance
 */
export const getTwitchAPI = async (twitchId?: string): Promise<ApiClient> => {
  const authProvider = getAuthProvider()
  const lookupTwitchId = twitchId || process.env.TWITCH_BOT_PROVIDERID!

  // Check if user is already in the auth provider
  try {
    if (!authProvider.hasUser(lookupTwitchId)) {
      // Get tokens for the user
      const tokens = await getTwitchTokens(lookupTwitchId)

      // Check if tokens exist
      const accessToken = tokens?.access_token
      const refreshToken = tokens?.refresh_token

      if (!accessToken || !refreshToken) {
        logger.info('[TWITCH] Missing tokens', { lookupTwitchId, twitchId })
        throw new Error('Missing Twitch tokens')
      }

      // Create token data object
      const tokenData = {
        accessToken,
        expiresIn: tokens.expires_in ?? 0,
        obtainmentTimestamp: tokens.obtainment_timestamp
          ? new Date(tokens.obtainment_timestamp).getTime()
          : Date.now(),
        refreshToken,
        scope: tokens.scope?.split(' ') ?? [],
      }

      // Add user to the auth provider
      authProvider.addUser(lookupTwitchId, tokenData)
    }
  } catch (error) {
    logger.error('[TWITCH] Error adding user to auth provider', { error, lookupTwitchId, twitchId })
  }

  // Create API client if it doesn't exist yet
  if (!apiClient) {
    apiClient = new ApiClient({ authProvider })
    logger.info('[TWITCH] Created new API client', { twitchId: lookupTwitchId })
  }

  // Return the API client
  return apiClient
}
