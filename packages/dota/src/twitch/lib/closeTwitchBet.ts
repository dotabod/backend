import { getTwitchAPI, logger } from '@dotabod/shared-utils'

export async function closeTwitchBet(won: boolean, twitchId: string, matchId: string) {
  const api = await getTwitchAPI(twitchId)

  try {
    await api.streams.createStreamMarker(
      twitchId,
      `Predictions closed, ${won ? 'won' : 'lost'} on match ${matchId}`,
    )
  } catch (e) {
    logger.error('[PREDICT] [BETS] Failed to create stream marker (close)', { twitchId, e })
  }

  return api.predictions
    .getPredictions(twitchId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] Close bets - no predictions found', { token: twitchId, predictions })
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
