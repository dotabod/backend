import { getTwitchAPI, logger } from '@dotabod/shared-utils'

import { retryTransient } from './retryTransient'

export const refundTwitchBet = async (twitchId: string, specificPredictionId?: string) => {
  const api = await getTwitchAPI(twitchId)

  try {
    // Always fetch predictions to verify status before canceling
    // Fetch more if we have a specific ID to find it in history
    const { data: predictions } = await retryTransient(
      () => api.predictions.getPredictions(twitchId, { limit: specificPredictionId ? 10 : 1 }),
      { label: 'refundTwitchBet:getPredictions' }
    )

    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[PREDICT] No predictions found', {
        specificPredictionId,
        twitchId,
      })
      return null
    }

    // Find the target prediction
    const prediction = specificPredictionId
      ? predictions.find((p) => p.id === specificPredictionId)
      : predictions[0]

    if (!prediction) {
      logger.info('[PREDICT] Specific prediction not found in recent list', {
        availablePredictions: predictions.map((p) => ({ id: p.id, status: p.status })),
        specificPredictionId,
        twitchId,
      })
      return null
    }

    // Check if prediction is in a state that can be canceled
    // Only ACTIVE or LOCKED predictions can be canceled
    if (!['ACTIVE', 'LOCKED'].includes(prediction.status)) {
      logger.info('[PREDICT] Cannot refund prediction - already resolved or canceled', {
        predictionId: prediction.id,
        status: prediction.status,
        twitchId,
      })
      return null
    }

    logger.info('[PREDICT] Refunding prediction', {
      predictionId: prediction.id,
      status: prediction.status,
      twitchId,
    })

    await retryTransient(() => api.predictions.cancelPrediction(twitchId, prediction.id), {
      label: 'refundTwitchBet:cancelPrediction',
    })
    return prediction.id
  } catch (error) {
    logger.error('[PREDICT] Error refunding twitch bet', { error, twitchId })
  }

  return null
}
