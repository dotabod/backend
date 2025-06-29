import { getTwitchAPI, logger } from '@dotabod/shared-utils'

export const refundTwitchBet = async (twitchId: string, specificPredictionId?: string) => {
  const api = await getTwitchAPI(twitchId)

  try {
    // If a specific prediction ID is provided, use it directly
    if (specificPredictionId) {
      logger.info('[PREDICT] Refunding specific prediction', {
        twitchId,
        predictionId: specificPredictionId,
      })
      await api.predictions.cancelPrediction(twitchId, specificPredictionId)
      return specificPredictionId
    }

    // Otherwise, get the most recent prediction
    const predictions = await api.predictions.getPredictions(twitchId, {
      limit: 1,
    })
    if (!Array.isArray(predictions?.data) || !predictions?.data.length) {
      logger.info('[PREDICT] No predictions found', {
        twitchId,
        predictions,
        data: predictions?.data?.[0],
      })
      return
    }

    const betId = predictions?.data?.[0]?.id
    await api.predictions.cancelPrediction(twitchId || '', betId)
    return betId
  } catch (e) {
    logger.error('[PREDICT] Error refunding twitch bet', { twitchId, e })
  }

  return null
}
