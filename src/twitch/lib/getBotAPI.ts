import { ApiClient } from '@twurple/api'

import { getAuthProvider } from './getAuthProvider.js'

export const getBotAPI = function () {
  const authProvider = getAuthProvider()
  const api = new ApiClient({ authProvider })
  console.log('[TWITCH]', 'Retrieved twitch dotabod api')

  return api
}
