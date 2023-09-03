import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('stats', {
  aliases: ['check', 'profile'],
  onlyOnline: true,

  handler: async (message, args, command) => {
    const {
      channel: { client },
    } = message

    try {
      const { player, hero } = await findAccountFromCmd(client.gsi, args, client.locale, command)

      const desc = t('profileUrl', {
        lng: client.locale,
        channel: getHeroNameOrColor(hero?.id ?? 0),
        url: `dotabuff.com/players/${player?.accountid ?? ''}`,
      })

      chatClient.say(message.channel.name, desc)
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})
