import { t } from 'i18next'

import type { ResolvedCosmetic } from '../../dota/lib/cosmetics'
import { getHeroNameOrColor } from '../../dota/lib/heroes'
import type { SocketClient } from '../../types'
import type { MessageType } from '../lib/command-handler'

export interface SetCommandDependencies {
  captureCosmetics: (client: SocketClient) => Promise<ResolvedCosmetic[]>
  say: (channel: string, text: string, messageId?: string) => void
}

export const runSetCommand = async function runSetCommand(
  message: MessageType,
  dependencies: SetCommandDependencies
): Promise<void> {
  const {
    channel: { name: channel, client },
  } = message
  const { locale } = client

  const matchId = client.gsi?.map?.matchid
  const heroId = client.gsi?.hero?.id
  if (matchId === undefined || matchId.length === 0 || heroId === undefined || heroId <= 0) {
    dependencies.say(
      channel,
      t('notPlaying', { emote: 'PauseChamp', lng: locale }),
      message.user.messageId
    )
    return
  }

  const heroName = getHeroNameOrColor(heroId)
  const items = await dependencies.captureCosmetics(client)

  if (items.length === 0) {
    dependencies.say(
      channel,
      t('cosmetics.empty', { heroName, lng: locale }),
      message.user.messageId
    )
    return
  }

  dependencies.say(
    channel,
    t('cosmetics.list', {
      count: items.length,
      heroName,
      lng: locale,
      url: `dotabod.com/${client.name}/set`,
    }),
    message.user.messageId
  )
}
