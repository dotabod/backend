import { t } from 'i18next'

import { DBSettings } from '@dotabod/settings'
import { calculateAvg } from '../../dota/lib/calculateAvg.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('avg', {
  onlyOnline: true,
  dbkey: DBSettings.commandAvg,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!message.channel.client.steam32Id) {
      chatClient.say(message.channel.name, t('unknownSteam', { lng: client.locale }))
      return
    }

    const avgDescriptor = ` - ${t('averageRank', { lng: client.locale })}`

    calculateAvg({
      locale: client.locale,
      currentMatchId: message.channel.client.gsi?.map?.matchid,
      players:
        gsiHandlers.get(client.token)?.players?.matchPlayers || getCurrentMatchPlayers(client.gsi),
    })
      .then((avg) => {
        chatClient.say(message.channel.name, `${avg}${avgDescriptor}`)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: client.locale }),
        )
      })
  },
})
