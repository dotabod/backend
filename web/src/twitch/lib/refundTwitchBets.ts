import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'
import { disabledBets } from './openTwitchBet.js'

export function refundTwitchBet(token: string) {
  if (disabledBets.has(token)) throw new Error('Bets not enabled')

  const { api, providerAccountId } = getChannelAPI(token)

  return api.predictions
    .getPredictions(providerAccountId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] No predictions found', { predictions })
        return
      }

      return api.predictions.cancelPrediction(providerAccountId || '', predictions[0].id)
    })
}
