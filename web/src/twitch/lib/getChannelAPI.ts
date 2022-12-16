import { ApiClient } from '@twurple/api'

import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = function (channel: string, userId: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(channel, userId)

  if (!providerAccountId) {
    console.log('[PREDICT]', 'Missing providerAccountId', channel)
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  console.log('[PREDICT]', 'Retrieved twitch api', channel)

  return { api, providerAccountId }
}
