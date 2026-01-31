import { getTwitchAPI, logger } from '@dotabod/shared-utils'

export const refundTwitchBet = async (twitchId: string, specificPredictionId?: string) => {
  const api = await getTwitchAPI(twitchId)

  try {
    // Always fetch predictions to verify status before canceling
    // Fetch more if we have a specific ID to find it in history
    const { data: predictions } = await api.predictions.getPredictions(twitchId, {
      limit: specificPredictionId ? 10 : 1,
    })

    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[PREDICT] No predictions found', {
        twitchId,
        specificPredictionId,
      })
      return null
    }

    // Find the target prediction
    const prediction = specificPredictionId
      ? predictions.find((p) => p.id === specificPredictionId)
      : predictions[0]

    if (!prediction) {
      logger.info('[PREDICT] Specific prediction not found in recent list', {
        twitchId,
        specificPredictionId,
        availablePredictions: predictions.map((p) => ({ id: p.id, status: p.status })),
      })
      return null
    }

    // Check if prediction is in a state that can be canceled
    // Only ACTIVE or LOCKED predictions can be canceled
    if (!['ACTIVE', 'LOCKED'].includes(prediction.status)) {
      logger.info('[PREDICT] Cannot refund prediction - already resolved or canceled', {
        twitchId,
        predictionId: prediction.id,
        status: prediction.status,
      })
      return null
    }

    logger.info('[PREDICT] Refunding prediction', {
      twitchId,
      predictionId: prediction.id,
      status: prediction.status,
    })

    await api.predictions.cancelPrediction(twitchId, prediction.id)
    return prediction.id
  } catch (e) {
    logger.error('[PREDICT] Error refunding twitch bet', { twitchId, e })
  }

  return null
}
