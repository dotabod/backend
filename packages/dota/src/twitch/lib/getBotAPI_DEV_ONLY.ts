import { ApiClient } from '@twurple/api'

import { logger } from '../../utils/logger.js'
import { getBotAuthProvider } from './getBotAuthProvider.js'

export const getBotAPI_DEV_ONLY = async function () {
  const authProvider = await getBotAuthProvider()

  if (authProvider === false) throw new Error('Missing authProvider')

  const api = new ApiClient({ authProvider })

  logger.info('[TWITCH] Retrieved twitch dotabod api')

  return api
}
