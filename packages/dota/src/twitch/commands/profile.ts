import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { profileLink } from './profileLink'

commandHandler.registerCommand('profile', {
  onlyOnline: true,
  dbkey: DBSettings.commandProfile,

  handler: async (message, args, command) => {
    const {
      channel: { client },
    } = message

    try {
      if (!args.length && client.steam32Id) {
        chatClient.say(
          message.channel.name,
          t('profileUrl', {
            channel: message.channel.client.name,
            lng: message.channel.client.locale,
            url: `dotabuff.com/players/${message.channel.client.steam32Id}`,
          }),
          message.user.messageId,
        )
        return
      }

      const { hero, playerIdx, player } = await profileLink({
        command,
        client,
        locale: client.locale,
        args: args,
      })

      const desc = t('profileUrl', {
        lng: client.locale,
        channel:
          player?.accountid === client.steam32Id
            ? client.name
            : getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        url: `dotabuff.com/players/${player?.accountid ?? ''}`,
      })

      chatClient.say(message.channel.name, desc, message.user.messageId)
    } catch (e) {
      chatClient.say(
        message.channel.name,
        (e as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})
