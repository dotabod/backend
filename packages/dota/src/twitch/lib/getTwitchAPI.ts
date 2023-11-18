import { ApiClient } from '@twurple/api'

import { findUserByTwitchId } from '../../dota/lib/connectedStreamers.js'
import { logger } from '../../utils/logger.js'
import { getAuthProvider } from './getAuthProvider.js'

let api: ApiClient | null = null
export const getTwitchAPI = function (twitchId: string): ApiClient {
  const authProvider = getAuthProvider()

  // User has not been added to the twurple provider yet
  // getCurrentScopesForUser will throw if the user does not exist
  try {
    authProvider.getCurrentScopesForUser(twitchId)
  } catch (e) {
    const twitchTokens = findUserByTwitchId(twitchId)
    const twitchAccount = twitchTokens?.accounts?.find((a) => a.provider === 'twitch')
    if (!twitchAccount || !twitchTokens) {
      logger.info('[TWITCHSETUP] Missing twitch tokens', { twitchId })
      throw new Error('Missing twitch tokens')
    }

    const tokenData = {
      scope: twitchAccount.scope?.split(' ') ?? [],
      expiresIn: twitchAccount.expires_in ?? 0,
      obtainmentTimestamp: new Date(twitchAccount.obtainment_timestamp || '')?.getTime(),
      accessToken: twitchAccount.access_token,
      refreshToken: twitchAccount.refresh_token,
    }

    authProvider.addUser(twitchId, tokenData)
  }

  // api singleton to prevent multiple api instances
  if (api) return api

  // should only be called once
  api = new ApiClient({ authProvider })
  logger.info('[PREDICT] Retrieved twitch api, must have been the first user', { twitchId })

  return api
}
