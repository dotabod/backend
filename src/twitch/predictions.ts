import { getChannelAuthProvider } from './setup'
import { ApiClient } from '@twurple/api'

async function getChannelAPI(channel: string, userId: string) {
  const { providerAccountId, authProvider } = await getChannelAuthProvider(channel, userId)

  if (!providerAccountId || !authProvider) {
    console.log('Missing providerAccountId or authProvider', channel)
    throw new Error('Missing providerAccountId or authProvider')
  }

  const api = new ApiClient({ authProvider })
  if (!api) {
    throw new Error('No channel api')
  }

  console.log('Retrieved twitch api', channel)

  return { api, providerAccountId }
}

export async function openTwitchBet(channel: string, userId: string) {
  console.log('[BETS] Opening twitch bet', channel)

  const { api, providerAccountId } = await getChannelAPI(channel, userId)

  return api.predictions.createPrediction(providerAccountId || '', {
    title: `Will ${channel} win this match?`,
    outcomes: ['Yes', 'No'],
    autoLockAfter: 4 * 60, // 4 minutes
  })
}

export async function closeTwitchBet(channel: string, won: boolean, userId: string) {
  const { api, providerAccountId } = await getChannelAPI(channel, userId)

  const { data: predictions } = await api.predictions.getPredictions(providerAccountId, {
    limit: 1,
  })
  const [wonOutcome, lossOutcome] = predictions[0].outcomes

  // if (predictions[0].status !== 'LOCKED') {
  //   console.log('[BETS] Bet is not locked', channel)
  //   return
  // }

  return api.predictions.resolvePrediction(
    providerAccountId || '',
    predictions[0].id,
    won ? wonOutcome.id : lossOutcome.id,
  )
}
