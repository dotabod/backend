import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = function (token: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(token)

  if (!providerAccountId) {
    logger.info('[PREDICT] Missing providerAccountId', { userId: token })
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  logger.info('[PREDICT] Retrieved twitch api', { userId: token })

  return { api, providerAccountId }
}
