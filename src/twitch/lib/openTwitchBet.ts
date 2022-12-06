import { getChannelAPI } from './getChannelAPI.js'

export const disabledBets = new Set()

export async function openTwitchBet(channel: string, userId: string, heroName?: string) {
  if (disabledBets.has(channel)) {
    throw new Error('Bets not enabled')
  }

  console.log('[PREDICT]', '[BETS] Opening twitch bet', channel)

  const { api, providerAccountId } = getChannelAPI(channel, userId)

  const title = heroName
    ? `Will ${channel} win with ${heroName}?`
    : `Will ${channel} win this match?`

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title,
      outcomes: ['Yes', 'No'],
      autoLockAfter: 4 * 60, // 4 minutes
    })
    .catch((e: any) => {
      if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
        console.log('[PREDICT]', '[BETS] Channel points not enabled for', channel)
        disabledBets.add(channel)
        throw new Error('Bets not enabled')
      }

      throw e
    })
}
