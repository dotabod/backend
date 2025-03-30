import { ApiClient } from '@twurple/api'

import { findUserByTwitchId } from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { getAuthProvider } from './getAuthProvider.js'
import { getBotTokens_DEV_ONLY } from './getBotTokens'
// The API client is a singleton that shares the auth provider
let api: ApiClient | null = null

export const getTwitchAPI = async (twitchId: string): Promise<ApiClient> => {
  const authProvider = getAuthProvider()

  // Check if user is already in the auth provider
  try {
    if (!authProvider.hasUser(twitchId)) {
      const isBotAccount = twitchId === process.env.TWITCH_BOT_PROVIDERID

      // Get tokens based on account type
      const tokens = isBotAccount
        ? await getBotTokens_DEV_ONLY()
        : findUserByTwitchId(twitchId)?.Account

      // Check if tokens exist
      const accessToken = tokens?.access_token
      const refreshToken = tokens?.refresh_token

      if (!accessToken || !refreshToken) {
        logger.info('[TWITCHSETUP] Missing twitch tokens', { twitchId, isBotAccount })
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
      authProvider.addUser(twitchId, tokenData)
    }
  } catch (e) {
    logger.error('[TWITCHAPI] Error adding user to auth provider', { twitchId, e })
  }

  // Create API client if it doesn't exist yet
  if (!api) {
    api = new ApiClient({ authProvider })
    logger.info('[TWITCHAPI] Created new API client', { twitchId })
  }

  // The API client uses the auth provider which now has the user,
  // so it will have access to the user's authentication
  return api
}

// Remove and re-add the user to get the new tokens in Twurple cache
export function updateTwurpleTokenForTwitchId(twitchId: string) {
  const authProvider = getAuthProvider()

  authProvider.removeUser(twitchId)
  getTwitchAPI(twitchId).catch((e) => {
    logger.error('[TWITCHAPI] Error updating twurple token', { twitchId, e })
  })
}
