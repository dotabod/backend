import { t } from 'i18next'

import type { SocketClient } from '../../types'
import CustomError from '../../utils/custom-error'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

interface ProfileLinkParams {
  command: string
  locale: string
  args: string[]
  client?: SocketClient
}

export const profileLink = async function profileLink({
  command,
  args,
  client,
  locale,
}: ProfileLinkParams) {
  const currentMatchId = client?.gsi?.map?.matchid
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  const playerData = await findAccountFromCmd(client, args, locale, command)

  if (!playerData?.hero) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return playerData
}
