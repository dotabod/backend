import { logger } from '../../utils/logger.js'
import { getTwitchAPI } from './getTwitchAPI.js'

export function closeTwitchBet(won: boolean, twitchId: string) {
  const api = getTwitchAPI(twitchId)

  return api.predictions
    .getPredictions(twitchId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] No predictions found', { token: twitchId, predictions })
        return
      }

      const [wonOutcome, lossOutcome] = predictions[0].outcomes

      // if (predictions[0].status !== 'LOCKED') {
      //   logger.info('[PREDICT]','[BETS] Bet is not locked', channel)
      //   return
      // }

      return api.predictions
        .resolvePrediction(twitchId || '', predictions[0].id, won ? wonOutcome.id : lossOutcome.id)
        .catch((e) => {
          logger.error('[BETS] Could not resolve prediction', { token: twitchId, error: e })
        })
    })
    .catch((e) => {
      logger.error('[BETS] Could not get predictions', { token: twitchId, error: e })
    })
}
