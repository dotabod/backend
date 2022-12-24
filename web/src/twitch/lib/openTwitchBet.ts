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
      title: betsInfo.title.replace('[heroname]', heroName ?? '').substring(0, 45),
      outcomes: [betsInfo.yes.substring(0, 25), betsInfo.no.substring(0, 25)],
      autoLockAfter: betsInfo.duration >= 30 && betsInfo.duration <= 1800 ? betsInfo.duration : 240, // 4 min default
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
