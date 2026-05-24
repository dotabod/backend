import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('d2pt', {
  aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
  onlyOnline: true,
  dbkey: DBSettings.commandBuilds,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      const { hero, playerIdx } = await findAccountFromCmd(client, args, client.locale, command)
      const heroName = getHeroNameOrColor(hero?.id ?? 0, playerIdx)

      chatClient.say(
        channel,
        t('dota2pt', {
          heroName,
          url: `dota2protracker.com/hero/${encodeURI(heroName).replace(/'/g, '%27')}`,
          lng: message.channel.client.locale,
        }),
        message.user.messageId,
      )
    } catch (e) {
      chatClient.say(
        message.channel.name,
        (e as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})
