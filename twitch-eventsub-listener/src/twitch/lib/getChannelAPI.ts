import { ApiClient } from '@twurple/api'

import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = function (userId: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(userId)

  if (!providerAccountId) {
    console.log('[PREDICT]', 'Missing providerAccountId', userId)
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  console.log('[PREDICT]', 'Retrieved twitch api', userId)

  return { api, providerAccountId }
}
