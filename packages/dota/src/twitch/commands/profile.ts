import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './profileLink.js'

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
        packet: client.gsi,
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
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})
