import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('d2pt', {
  aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
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
          lng: message.channel.client.locale,
          url: `dota2protracker.com/hero/${encodeURI(heroName).replaceAll('\'', '%27')}`,
        }),
        message.user.messageId
      )
    } catch (error) {
      chatClient.say(
        message.channel.name,
        (error as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
