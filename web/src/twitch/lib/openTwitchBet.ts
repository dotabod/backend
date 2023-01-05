import { t } from 'i18next'

import { DBSettings, defaultSettings, getValueOrDefault } from '../../db/settings.js'
import { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { getChannelAPI } from './getChannelAPI.js'

export const disabledBets = new Set()

export async function openTwitchBet(
  locale: string,
  token: string,
  heroName?: string,
  settings?: SocketClient['settings'],
) {
  if (disabledBets.has(token)) {
    throw new Error('Bets not enabled')
  }

  const { api, providerAccountId } = getChannelAPI(token)
  const betsInfo = getValueOrDefault(DBSettings.betsInfo, settings)
  logger.info('[PREDICT] [BETS] Opening twitch bet', { userId: token, heroName })

  const title =
    betsInfo.title !== defaultSettings.betsInfo.title
      ? betsInfo.title.replace('[heroname]', heroName ?? '')
      : t('predictions.title', { lng: locale, heroName })

  const yes =
    betsInfo.yes !== defaultSettings.betsInfo.yes
      ? betsInfo.yes
      : t('predictions.yes', { lng: locale })

  const no =
    betsInfo.no !== defaultSettings.betsInfo.no ? betsInfo.no : t('predictions.no', { lng: locale })

  return api.predictions
    .createPrediction(providerAccountId || '', {
      title: title.substring(0, 45),
      outcomes: [yes.substring(0, 25), no.substring(0, 25)],
      autoLockAfter: betsInfo.duration >= 30 && betsInfo.duration <= 1800 ? betsInfo.duration : 240, // 4 min default
    })
    .catch((e: any) => {
      if (JSON.parse(e?.body)?.message?.includes('channel points not enabled')) {
        logger.info('[PREDICT] [BETS] Channel points not enabled for', { userId: token })
        disabledBets.add(token)
        throw new Error('Bets not enabled')
      }

      throw e
    })
}
