import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'

export const disabledBets = new Set()

export async function openTwitchBet(
  userId: string,
  heroName?: string,
  settings?: SocketClient['settings'],
) {
  if (disabledBets.has(userId)) {
    throw new Error('Bets not enabled')
  }

  const { api, providerAccountId } = getChannelAPI(userId)
  const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings)
  logger.info('[PREDICT] [BETS] Opening twitch bet', { userId, betsInfo })

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title: betsInfo.title.replace('[heroname]', heroName ?? ''),
      outcomes: [betsInfo.yes, betsInfo.no],
      autoLockAfter: betsInfo.duration, // 4 minutes
    })
    .catch((e: any) => {
      if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
        logger.info('[PREDICT] [BETS] Channel points not enabled for', { userId })
        disabledBets.add(userId)
        throw new Error('Bets not enabled')
      }

      throw e
    })
}
