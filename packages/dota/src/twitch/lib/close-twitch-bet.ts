import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { StreamNotLiveError } from '@twurple/api'
import type { ApiClient, HelixPrediction } from '@twurple/api'

import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import { refundTwitchBet } from './refund-twitch-bets'
import { retryTransient } from './retry-transient'

type PredictionSettings = Pick<SocketClient, 'settings' | 'subscription'>

const settlePrediction = async function settlePrediction(
  predictions: ApiClient['predictions'],
  prediction: HelixPrediction,
  twitchId: string,
  matchId: string,
  won: boolean,
  { settings, subscription }: PredictionSettings
): Promise<'refunded' | 'resolved' | 'failed'> {
  const [wonOutcome, lossOutcome] = prediction.outcomes
  const discardZeroBets = getValueOrDefault(DBSettings.discardZeroBets, settings, subscription)
  if (discardZeroBets && (wonOutcome.users === 0 || lossOutcome.users === 0)) {
    logger.info('[PREDICT] [BETS] Refunding prediction - zero predictions on one side', {
      lossOutcomeUsers: lossOutcome.users,
      matchId,
      predictionId: prediction.id,
      twitchId,
      wonOutcomeUsers: wonOutcome.users,
    })
    const refundedId = await refundTwitchBet(twitchId, prediction.id)
    return refundedId === prediction.id ? 'refunded' : 'failed'
  }

  await retryTransient(
    async () =>
      await predictions.resolvePrediction(
        twitchId,
        prediction.id,
        won ? wonOutcome.id : lossOutcome.id
      ),
    { label: 'settlePrediction:resolvePrediction' }
  )
  return 'resolved'
}

export const closeTwitchBet = async function closeTwitchBet(
  won: boolean,
  twitchId: string,
  matchId: string,
  client: PredictionSettings
): Promise<void> {
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
    try {
      await settlePrediction(api.predictions, prediction, twitchId, matchId, won, client)
    } catch (error) {
      logger.error('[BETS] Could not resolve prediction', { error, token: twitchId })
    }
  } catch (error) {
    logger.error('[BETS] Could not get predictions', { error, token: twitchId })
  }
}

export const closeTwitchBetById = async function closeTwitchBetById(
  won: boolean,
  twitchId: string,
  predictionId: string,
  matchId: string,
  client: PredictionSettings
): Promise<boolean> {
  try {
    const api = await getTwitchAPI(twitchId)

    // Fetch recent predictions and find the one matching our ID
    // We fetch more than 1 since the current game might have a different prediction
    const { data: predictions } = await retryTransient(
      async () => await api.predictions.getPredictions(twitchId, { limit: 10 }),
      { label: 'resolveMatch:getPredictions' }
    )

    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[BETS] Retroactive resolution - no predictions found', {
        matchId,
        predictionId,
        twitchId,
      })
      return false
    }

    const prediction = predictions.find((p) => p.id === predictionId)

    if (!prediction) {
      logger.info('[BETS] Retroactive resolution - specific prediction not found in recent list', {
        availablePredictions: predictions.map((p) => ({ id: p.id, status: p.status })),
        matchId,
        predictionId,
        twitchId,
      })
      return false
    }

    if (!['ACTIVE', 'LOCKED'].includes(prediction.status)) {
      logger.info('[BETS] Retroactive resolution - prediction already resolved or canceled', {
        matchId,
        predictionId,
        status: prediction.status,
        twitchId,
      })
      return false
    }

    const result = await settlePrediction(
      api.predictions,
      prediction,
      twitchId,
      matchId,
      won,
      client
    )
    if (result !== 'resolved') {
      return result === 'refunded'
    }

    logger.info('[BETS] Retroactive resolution - prediction resolved successfully', {
      matchId,
      predictionId,
      twitchId,
      won,
    })

    return true
  } catch (error) {
    logger.info('[BETS] Retroactive resolution - could not resolve prediction', {
      error,
      matchId,
      predictionId,
      twitchId,
    })
    return false
  }
}
