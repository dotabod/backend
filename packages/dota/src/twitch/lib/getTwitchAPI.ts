import { ApiClient } from '@twurple/api'

import { findUserByTwitchId } from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { getAuthProvider } from './getAuthProvider.js'

let api: ApiClient | null = null
export const getTwitchAPI = function (twitchId: string): ApiClient {
  const authProvider = getAuthProvider()

  // User has not been added to the twurple provider yet
  if (authProvider.getIntentsForUser(twitchId).length === 0) {
    const twitchTokens = findUserByTwitchId(twitchId)
    if (!twitchTokens?.Account?.access_token || !twitchTokens.Account.refresh_token) {
      logger.info('[TWITCHSETUP] Missing twitch tokens', { twitchId })
      throw new Error('Missing twitch tokens')
    }

    const tokenData = {
      scope: twitchTokens.Account.scope?.split(' ') ?? [],
      expiresIn: twitchTokens.Account.expires_in ?? 0,
      obtainmentTimestamp: twitchTokens.Account.obtainment_timestamp?.getTime() ?? 0,
      accessToken: twitchTokens.Account.access_token,
      refreshToken: twitchTokens.Account.refresh_token,
    }

    // TODO: missing intents
    authProvider.addUser(twitchId, tokenData)
  }

  // api singleton to prevent multiple api instances
  if (api) return api

  // should only be called once
  api = new ApiClient({ authProvider })
  logger.info('[PREDICT] Retrieved twitch api, must have been the first user', { twitchId })

  return api
}
