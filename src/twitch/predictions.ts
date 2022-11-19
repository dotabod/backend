import { ApiClient } from '@twurple/api'

import { getAuthProvider, getChannelAuthProvider } from './setup'

function getChannelAPI(channel: string, userId: string) {
  const { providerAccountId, authProvider } = getChannelAuthProvider(channel, userId)

  if (!providerAccountId) {
    console.log('[PREDICT]', 'Missing providerAccountId', channel)
    throw new Error('Missing providerAccountId')
  }

  const api = new ApiClient({ authProvider })
  console.log('[PREDICT]', 'Retrieved twitch api', channel)

  return { api, providerAccountId }
}

export function getBotAPI() {
  const authProvider = getAuthProvider()
  const api = new ApiClient({ authProvider })
  console.log('[BOT]', 'Retrieved twitch bot api')
  return api
}

export async function openTwitchBet(channel: string, userId: string, heroName?: string) {
  console.log('[PREDICT]', '[BETS] Opening twitch bet', channel)

  const { api, providerAccountId } = getChannelAPI(channel, userId)

  const title = heroName
    ? `Will ${channel} win with ${heroName}?`
    : `Will ${channel} win this match?`

  return api.predictions.createPrediction(providerAccountId || '', {
    title,
    outcomes: ['Yes', 'No'],
    autoLockAfter: 4 * 60, // 4 minutes
  })
}

export function closeTwitchBet(channel: string, won: boolean, userId: string) {
  const { api, providerAccountId } = getChannelAPI(channel, userId)

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
