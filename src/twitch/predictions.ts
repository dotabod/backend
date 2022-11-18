import { getAuthProvider, getChannelAuthProvider } from './setup'
import { ApiClient } from '@twurple/api'

async function getChannelAPI(channel: string, userId: string) {
  const { providerAccountId, authProvider } = await getChannelAuthProvider(channel, userId)

  if (!providerAccountId || !authProvider) {
    console.log('[PREDICT]', 'Missing providerAccountId or authProvider', channel)
    throw new Error('Missing providerAccountId or authProvider')
  }

  const api = new ApiClient({ authProvider })
  if (!api) {
    throw new Error('No channel api')
  }

  console.log('[PREDICT]', 'Retrieved twitch api', channel)

  return { api, providerAccountId }
}

export async function getBotAPI() {
  const authProvider = await getAuthProvider()

  if (!authProvider) {
    throw new Error('Missing authProvider')
  }

  const api = new ApiClient({ authProvider })
  if (!api) {
    throw new Error('No bot api')
  }

  console.log('[BOT]', 'Retrieved twitch bot api')

  return api
}

export async function openTwitchBet(channel: string, userId: string, heroName?: string) {
  console.log('[PREDICT]', '[BETS] Opening twitch bet', channel)

  const { api, providerAccountId } = await getChannelAPI(channel, userId)

  const title = heroName
    ? `Will ${channel} win with ${heroName}?`
    : `Will ${channel} win this match?`

  return api.predictions.createPrediction(providerAccountId || '', {
    title,
    outcomes: ['Yes', 'No'],
    autoLockAfter: 4 * 60, // 4 minutes
  })
}

export async function closeTwitchBet(channel: string, won: boolean, userId: string) {
  const { api, providerAccountId } = await getChannelAPI(channel, userId)

  const { data: predictions } = await api.predictions.getPredictions(providerAccountId, {
    limit: 1,
  })

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
}
