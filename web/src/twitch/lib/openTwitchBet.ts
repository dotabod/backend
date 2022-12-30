import { t } from 'i18next'

import { DBSettings, defaultSettings, getValueOrDefault } from '../../db/settings.js'
import { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'

export const disabledBets = new Set()

export async function openTwitchBet(
  locale: string,
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

  const title =
    betsInfo.title !== defaultSettings[DBSettings.betsInfo].title
      ? betsInfo.title
      : t('predictions.title', { lng: locale, heroName })

  const yes =
    betsInfo.yes !== defaultSettings[DBSettings.betsInfo].yes
      ? betsInfo.yes
      : t('predictions.yes', { lng: locale })

  const no =
    betsInfo.no !== defaultSettings[DBSettings.betsInfo].no
      ? betsInfo.no
      : t('predictions.no', { lng: locale })

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title: title.substring(0, 45),
      outcomes: [yes.substring(0, 25), no.substring(0, 25)],
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
