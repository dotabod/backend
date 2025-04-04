import { ApiClient } from '@twurple/api'
import { getAuthProvider } from './getAuthProvider.js'
import { getTwitchTokens } from './getTwitchTokens.js'
import { logger } from './twitch/lib/logger.js'
// The API client is a singleton that shares the auth provider
let api: ApiClient | null = null

export const getTwitchAPI = async (twitchId?: string): Promise<ApiClient> => {
  const authProvider = getAuthProvider()
  const lookupTwitchId = twitchId || process.env.TWITCH_BOT_PROVIDERID!

  // Check if user is already in the auth provider
  try {
    if (!authProvider.hasUser(lookupTwitchId)) {
      // Get tokens based on account type
      const tokens = await getTwitchTokens(lookupTwitchId)

      // Check if tokens exist
      const accessToken = tokens?.access_token
      const refreshToken = tokens?.refresh_token

      if (!accessToken || !refreshToken) {
        logger.info('[TWITCHSETUP] Missing twitch tokens', { twitchId, lookupTwitchId })
        throw new Error('Missing twitch tokens')
      }

      // Create token data object
      const tokenData = {
        scope: tokens.scope?.split(' ') ?? [],
        expiresIn: tokens.expires_in ?? 0,
        obtainmentTimestamp: new Date(tokens.obtainment_timestamp || '')?.getTime(),
        accessToken,
        refreshToken,
      }

      // Add user to the auth provider
      authProvider.addUser(lookupTwitchId, tokenData)
    }
  } catch (e) {
    logger.error('[TWITCHAPI] Error adding user to auth provider', { twitchId, lookupTwitchId, e })
  }

  // Create API client if it doesn't exist yet
  if (!api) {
    api = new ApiClient({ authProvider })
    logger.info('[TWITCHAPI] Created new API client', { twitchId: lookupTwitchId })
  }

  // The API client uses the auth provider which now has the user,
  // so it will have access to the user's authentication
  return api
}
