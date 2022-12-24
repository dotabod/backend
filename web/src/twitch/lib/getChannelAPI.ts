import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = function (userId: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(userId)

  if (!providerAccountId) {
    logger.info('[PREDICT] Missing providerAccountId', userId)
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  logger.info('[PREDICT] Retrieved twitch api', userId)

  return { api, providerAccountId }
}
