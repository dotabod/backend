import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getAuthProvider } from './getAuthProvider.js'

export const getBotAPI = function () {
  const authProvider = getAuthProvider()
  const api = new ApiClient({ authProvider })
  logger.info('[TWITCH]', 'Retrieved twitch dotabod api')

  return api
}
