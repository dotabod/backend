import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { StreamNotLiveError } from '@twurple/api'

import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import { refundTwitchBet } from './refund-twitch-bets'
import { retryTransient } from './retry-transient'

export const closeTwitchBet = async function closeTwitchBet(
  won: boolean,
  twitchId: string,
  matchId: string,
  settings?: SocketClient['settings'],
  subscription?: SocketClient['subscription']
) {
  const api = await getTwitchAPI(twitchId)

  try {
    await api.streams.createStreamMarker(
      twitchId,
      `Predictions closed, ${won ? 'won' : 'lost'} on match ${matchId}`
    )
  } catch (error) {
    if (error instanceof StreamNotLiveError) {
      logger.info('[PREDICT] [BETS] Skipped stream marker (close) — channel offline', { twitchId })
    } else {
      logger.error('[PREDICT] [BETS] Failed to create stream marker (close)', { error, twitchId })
    }
  }

  try {
    const { data: predictions } = await retryTransient(
      async () => await api.predictions.getPredictions(twitchId, { limit: 1 }),
      { label: 'closeTwitchBet:getPredictions' }
    )
    if (!Array.isArray(predictions) || predictions.length === 0) {
      logger.info('[PREDICT] Close bets - no predictions found', {
        predictions,
        token: twitchId,
      })
      return
    }

    const [prediction] = predictions
    const [wonOutcome, lossOutcome] = prediction.outcomes
    const discardZeroBets = getValueOrDefault(DBSettings.discardZeroBets, settings, subscription)
    if (discardZeroBets && (wonOutcome.users === 0 || lossOutcome.users === 0)) {
      logger.info('[PREDICT] [BETS] Refunding prediction - zero predictions on one side', {
        lossOutcomeUsers: lossOutcome.users,
        matchId,
        twitchId,
        wonOutcomeUsers: wonOutcome.users,
      })
      await refundTwitchBet(twitchId, prediction.id)
      return
    }

    try {
      await retryTransient(
        async () =>
          await api.predictions.resolvePrediction(
            twitchId,
            prediction.id,
            won ? wonOutcome.id : lossOutcome.id
          ),
        { label: 'closeTwitchBet:resolvePrediction' }
      )
    } catch (error) {
      logger.error('[BETS] Could not resolve prediction', { error, token: twitchId })
    }
  } catch (error) {
    logger.error('[BETS] Could not get predictions', { error, token: twitchId })
  }
}
