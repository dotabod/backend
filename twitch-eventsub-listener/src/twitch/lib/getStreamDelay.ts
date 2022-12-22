import { getChannelAPI } from './getChannelAPI.js'

export async function getStreamDelay(twitchId: string) {
  const api = await getChannelAPI(twitchId)
  const channelInfo = await api.channels.getChannelInfoById(twitchId)

  return channelInfo?.delay ?? 0
}
