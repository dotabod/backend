import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getAuthProvider } from './getAuthProvider.js'
import { getBotTokens_DEV_ONLY } from './getBotTokens.js'

// Singleton instance of the API client
let apiClientInstance: ApiClient | null = null

export const getBotAPI_DEV_ONLY = async () => {
  // Return existing instance if available
  if (apiClientInstance) {
    return apiClientInstance
  }

  const authProvider = getAuthProvider()
  const botTokens = await getBotTokens_DEV_ONLY()

  const twitchId = process.env.TWITCH_BOT_PROVIDERID
  if (!twitchId) {
    logger.info('[TWITCHSETUP] Missing twitchId')
    return false
  }

  if (!botTokens?.access_token || !botTokens.refresh_token) {
    logger.info('[TWITCHSETUP] Missing bot tokens', {
      twitchId,
    })
    return false
  }

  const tokenData = {
    scope: botTokens.scope?.split(' ') ?? [],
    expiresIn: botTokens.expires_in ?? 0,
    obtainmentTimestamp: botTokens.obtainment_timestamp
      ? new Date(botTokens.obtainment_timestamp).getTime()
      : 0,
    accessToken: botTokens.access_token,
    refreshToken: botTokens.refresh_token,
  }

  authProvider.addUser(twitchId, tokenData, ['chat'])

  // Create and store the singleton instance
  apiClientInstance = new ApiClient({ authProvider })
  logger.info('[TWITCH] Retrieved twitch dotabod api')

  return apiClientInstance
}
