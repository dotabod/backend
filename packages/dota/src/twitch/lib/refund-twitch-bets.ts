import { getTwitchAPI, logger } from '@dotabod/shared-utils'

import { retryTransient } from './retry-transient'

type PredictionRefund =
  | { status: 'refunded'; predictionId: string }
  | { status: 'inactive' }
  | { status: 'unconfirmed' }

export const refundTwitchBet = async (
  twitchId: string,
  specificPredictionId?: string
): Promise<PredictionRefund> => {
  try {
    const api = await getTwitchAPI(twitchId)
    // Always fetch predictions to verify status before canceling
    // Fetch more if we have a specific ID to find it in history
    const { data: predictions } = await retryTransient(
      async () =>
        await api.predictions.getPredictions(twitchId, {
          limit: specificPredictionId !== undefined && specificPredictionId.length > 0 ? 10 : 1,
        }),
      { label: 'refundTwitchBet:getPredictions' }
    )

    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[PREDICT] No predictions found', {
        specificPredictionId,
        twitchId,
      })
      return { status: 'unconfirmed' }
    }

    // Find the target prediction
    const prediction =
      specificPredictionId !== undefined && specificPredictionId.length > 0
        ? predictions.find((p) => p.id === specificPredictionId)
        : predictions[0]

    if (!prediction) {
      logger.info('[PREDICT] Specific prediction not found in recent list', {
        availablePredictions: predictions.map((p) => ({ id: p.id, status: p.status })),
        specificPredictionId,
        twitchId,
      })
      return { status: 'unconfirmed' }
    }

    // Check if prediction is in a state that can be canceled
    // Only ACTIVE or LOCKED predictions can be canceled
    if (!['ACTIVE', 'LOCKED'].includes(prediction.status)) {
      logger.info('[PREDICT] Cannot refund prediction - already resolved or canceled', {
        predictionId: prediction.id,
        status: prediction.status,
        twitchId,
      })
      return { status: 'inactive' }
    }

    logger.info('[PREDICT] Refunding prediction', {
      predictionId: prediction.id,
      status: prediction.status,
      twitchId,
    })

    await retryTransient(
      async () => await api.predictions.cancelPrediction(twitchId, prediction.id),
      {
        label: 'refundTwitchBet:cancelPrediction',
      }
    )
    return { predictionId: prediction.id, status: 'refunded' }
  } catch (error) {
    logger.error('[PREDICT] Error refunding twitch bet', { error, twitchId })
  }

  return { status: 'unconfirmed' }
}
