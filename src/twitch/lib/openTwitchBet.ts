import { getChannelAPI } from './getChannelAPI'

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
