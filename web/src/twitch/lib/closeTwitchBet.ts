import { getChannelAPI } from './getChannelAPI.js'
import { disabledBets } from './openTwitchBet.js'

export async function closeTwitchBet(channel: string, won: boolean, userId: string) {
  if (disabledBets.has(channel)) throw new Error('Bets not enabled')

  const { api, providerAccountId } = await getChannelAPI(channel, userId)

  return api.predictions
    .getPredictions(providerAccountId, {
      limit: 1,
    })
    .then(({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        console.log('[PREDICT]', 'No predictions found', predictions)
        return
      }

      const [wonOutcome, lossOutcome] = predictions[0].outcomes

      // if (predictions[0].status !== 'LOCKED') {
      //   console.log('[PREDICT]','[BETS] Bet is not locked', channel)
      //   return
      // }
      return api.predictions.resolvePrediction(
        providerAccountId || '',
        predictions[0].id,
        won ? wonOutcome.id : lossOutcome.id,
      )
    })
}
