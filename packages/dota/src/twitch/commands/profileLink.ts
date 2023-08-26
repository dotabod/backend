import { t } from 'i18next'

import CustomError from '../../utils/customError.js'
import { getPlayerFromArgs, ProfileLinkParams } from './stats.js'

export function profileLink({ command, players, locale, currentMatchId, args }: ProfileLinkParams) {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  if (!players?.length) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  const { player, heroKey } = getPlayerFromArgs({ args, players, locale, command })
  return { heroKey, ...player }
}
