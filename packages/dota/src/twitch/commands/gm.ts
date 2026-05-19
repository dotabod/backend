import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch'
import { DBSettings, ENABLE_SPECTATE_FRIEND_GAME } from '../../settings'
import { gameMedals } from '../../steam/medals'
import { is8500Plus } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('gm', {
  aliases: ['medals', 'ranks'],
  onlyOnline: true,
  dbkey: DBSettings.commandGM,
  handler: async (message, args) => {
    const {
      channel: { client },
    } = message
    if (!message.channel.client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })

    gameMedals(client.locale, message.channel.client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        let append = ''
        if (
          !ENABLE_SPECTATE_FRIEND_GAME ||
          (matchPlayers.length === 1 &&
            matchPlayers[0].accountid === client.steam32Id &&
            is8500Plus(client))
        ) {
          append = ` · ${t('matchDataValveDisabled', { emote: 'PoroSad', lng: message.channel.client.locale })}`
        }

        chatClient.say(message.channel.name, desc + append, message.user.messageId)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
          message.user.messageId,
        )
      })
  },
})
