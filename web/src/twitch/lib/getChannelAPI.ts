import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = function (channelId: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(channelId)

  if (!providerAccountId) {
    logger.info('[PREDICT] Missing providerAccountId', { channelId })
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  logger.info('[PREDICT] Retrieved twitch api', { channelId })

  return { api, providerAccountId }
}
