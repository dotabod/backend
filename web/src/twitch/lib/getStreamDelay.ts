import { getChannelAPI } from './getChannelAPI.js'

export async function getStreamDelay(userId: string) {
  const { api, providerAccountId } = getChannelAPI(userId)
  const channelInfo = await api.channels.getChannelInfoById(providerAccountId)

  return channelInfo?.delay
}
