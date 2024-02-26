import { logger } from '../../utils/logger.js'
import { getTwitchAPI } from './getTwitchAPI.js'

export const refundTwitchBet = async (twitchId: string) => {
  const api = getTwitchAPI(twitchId)

  try {
    const predictions = await api.predictions.getPredictions(twitchId, {
      limit: 1,
    })
    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[PREDICT] No predictions found', { twitchId, predictions })
      return
    }

    const betId = (predictions?.[0]?.id as string) || predictions.data?.[0]?.id
    await api.predictions.cancelPrediction(twitchId || '', betId)
    return betId
  } catch (e) {
    logger.error('[PREDICT] Error refunding twitch bet', { twitchId, e })
  }

  return null
}
