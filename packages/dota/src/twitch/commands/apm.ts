import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './profileLink.js'

commandHandler.registerCommand('apm', {
  onlyOnline: true,
  dbkey: DBSettings.commandAPM,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      const { player, hero, playerIdx } = await profileLink({
        command,
        packet: client.gsi,
        locale: client.locale,
        args: args,
      })

      const commandsIssued = player?.commands_issued ?? client.gsi?.player?.commands_issued ?? 0
      const gameTime = client.gsi?.map?.game_time ?? 1
      const apm = commandsIssued ? Math.round(commandsIssued / (gameTime / 60)) : 0

      const heroName = player?.commands_issued
        ? getHeroNameOrColor(hero?.id ?? 0, playerIdx)
        : getHeroNameOrColor(client?.gsi?.hero?.id ?? 0)

      chatClient.say(
        channel,
        t('apm', {
          heroName,
          emote: 'Chatting',
          lng: message.channel.client.locale,
          count: apm,
        }),
      )
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})
