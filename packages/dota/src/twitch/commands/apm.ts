import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { profileLink } from './profileLink'

commandHandler.registerCommand('apm', {
  dbkey: DBSettings.commandAPM,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      const { player, hero, playerIdx } = await profileLink({
        args: args,
        client,
        command,
        locale: client.locale,
      })

      const commandsIssued =
        player && 'commands_issued' in player
          ? player.commands_issued
          : (client.gsi?.player?.commands_issued ?? 0)
      const gameTime = client.gsi?.map?.game_time ?? 1
      const apm = commandsIssued ? Math.round(commandsIssued / (gameTime / 60)) : 0

      const heroName =
        player && 'commands_issued' in player
          ? getHeroNameOrColor(hero?.id ?? 0, playerIdx)
          : getHeroNameOrColor(client?.gsi?.hero?.id ?? 0)

      chatClient.say(
        channel,
        t('apm', {
          count: apm,
          emote: 'Chatting',
          heroName,
          lng: message.channel.client.locale,
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
