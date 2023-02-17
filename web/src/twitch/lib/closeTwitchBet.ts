import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'

export function closeTwitchBet(won: boolean, token: string) {
  const { api, providerAccountId } = getChannelAPI(token)

  return api.predictions
    .getPredictions(providerAccountId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] No predictions found', { token, predictions })
        return
      }

      const [wonOutcome, lossOutcome] = predictions[0].outcomes

      // if (predictions[0].status !== 'LOCKED') {
      //   logger.info('[PREDICT]','[BETS] Bet is not locked', channel)
      //   return
      // }

      return api.predictions
        .resolvePrediction(
          providerAccountId || '',
          predictions[0].id,
          won ? wonOutcome.id : lossOutcome.id,
        )
        .catch((e) => {
          logger.error('[BETS] Could not resolve prediction', { token, error: e })
        })
    })
    .catch((e) => {
      logger.error('[BETS] Could not get predictions', { token, error: e })
    })
}
