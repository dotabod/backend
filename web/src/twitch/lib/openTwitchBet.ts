import { getChannelAPI } from './getChannelAPI.js'

export const disabledBets = new Set()

export async function openTwitchBet(userId: string, heroName?: string) {
  if (disabledBets.has(userId)) {
    throw new Error('Bets not enabled')
  }

  console.log('[PREDICT]', '[BETS] Opening twitch bet', userId)

  const { api, providerAccountId } = getChannelAPI(userId)

  const title = heroName ? `Will we win with ${heroName}?` : `Will we win this match?`

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title,
      outcomes: ['Yes', 'No'],
      autoLockAfter: 4 * 60, // 4 minutes
    })
    .catch((e: any) => {
      if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
        console.log('[PREDICT]', '[BETS] Channel points not enabled for', userId)
        disabledBets.add(userId)
        throw new Error('Bets not enabled')
      }

      throw e
    })
}
