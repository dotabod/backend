import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('profile', {
  onlyOnline: true,
  dbkey: DBSettings.commandProfile,

  handler: async (message, args, command) => {
    const {
      channel: { client },
    } = message

    try {
      const { player, playerIdx, hero } = await findAccountFromCmd(
        client.gsi,
        args,
        client.locale,
        command,
      )

      const desc = t('profileUrl', {
        lng: client.locale,
        channel: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        url: `dotabuff.com/players/${player?.accountid ?? ''}`,
      })

      chatClient.say(message.channel.name, desc, message.user.messageId)
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})
