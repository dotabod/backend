import { logger } from '../../utils/logger.js'
import { getTwitchAPI } from './getTwitchAPI.js'

export function refundTwitchBet(twitchId: string) {
  const api = getTwitchAPI(twitchId)

  return api.predictions
    .getPredictions(twitchId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] No predictions found', { predictions })
        return
      }

      return api.predictions.cancelPrediction(twitchId || '', predictions[0].id)
    })
}
