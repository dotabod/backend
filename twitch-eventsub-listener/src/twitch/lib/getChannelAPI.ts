import { ApiClient } from '@twurple/api'

import { getChannelAuthProvider } from './getChannelAuthProvider.js'

export const getChannelAPI = async function (twitchId: string) {
  if (!twitchId) {
    console.log('[PREDICT]', 'Missing providerAccountId', twitchId)
    throw new Error('Missing providerAccountId')
  }

  const authProvider = await getChannelAuthProvider(twitchId)
  // @ts-expect-error asdf
  const api = new ApiClient({ authProvider })
  console.log('[PREDICT]', 'Retrieved twitch api', twitchId)

  return api
}
