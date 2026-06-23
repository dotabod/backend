import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { StreamNotLiveError } from '@twurple/api'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import { refundTwitchBet } from './refundTwitchBets'
import { retryTransient } from './retryTransient'

export async function closeTwitchBet(
  won: boolean,
  twitchId: string,
  matchId: string,
  settings?: SocketClient['settings'],
  subscription?: SocketClient['subscription'],
) {
  const api = await getTwitchAPI(twitchId)

  try {
    await api.streams.createStreamMarker(
      twitchId,
      `Predictions closed, ${won ? 'won' : 'lost'} on match ${matchId}`,
    )
  } catch (e) {
    if (e instanceof StreamNotLiveError) {
      logger.info('[PREDICT] [BETS] Skipped stream marker (close) — channel offline', { twitchId })
    } else {
      logger.error('[PREDICT] [BETS] Failed to create stream marker (close)', { twitchId, e })
    }
  }

  return retryTransient(() => api.predictions.getPredictions(twitchId, { limit: 1 }), {
    label: 'closeTwitchBet:getPredictions',
  })
    .then(async ({ data: predictions }) => {
      if (!Array.isArray(predictions) || !predictions.length) {
        logger.info('[PREDICT] Close bets - no predictions found', {
          token: twitchId,
          predictions,
        })
        return
      }

      const [wonOutcome, lossOutcome] = predictions[0].outcomes

      // if (predictions[0].status !== 'LOCKED') {
      //   logger.info('[PREDICT]','[BETS] Bet is not locked', channel)
      //   return
      // }

      // Check if the discardZeroBets setting is enabled
      const discardZeroBets = getValueOrDefault(DBSettings.discardZeroBets, settings, subscription)

      // If enabled, check if either outcome has zero users
      if (discardZeroBets && (wonOutcome.users === 0 || lossOutcome.users === 0)) {
        logger.info('[PREDICT] [BETS] Refunding prediction - zero predictions on one side', {
          twitchId,
          matchId,
          wonOutcomeUsers: wonOutcome.users,
          lossOutcomeUsers: lossOutcome.users,
        })
        await refundTwitchBet(twitchId, predictions[0].id)
        return
      }

      return retryTransient(
        () =>
          api.predictions.resolvePrediction(
            twitchId || '',
            predictions[0].id,
            won ? wonOutcome.id : lossOutcome.id,
          ),
        { label: 'closeTwitchBet:resolvePrediction' },
      ).catch((e) => {
        logger.error('[BETS] Could not resolve prediction', { token: twitchId, error: e })
      })
    })
    .catch((e) => {
      logger.error('[BETS] Could not get predictions', { token: twitchId, error: e })
    })
}
