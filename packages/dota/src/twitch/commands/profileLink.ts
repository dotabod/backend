import { t } from 'i18next'

import type { Packet } from '../../types'
import CustomError from '../../utils/customError'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

interface ProfileLinkParams {
  command: string
  locale: string
  args: string[]
  packet?: Packet
}

export async function profileLink({ command, args, packet, locale }: ProfileLinkParams) {
  const currentMatchId = packet?.map?.matchid
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  const playerData = await findAccountFromCmd(packet, args, locale, command)

  if (!playerData?.hero) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return playerData
}
