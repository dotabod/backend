import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'
import { profileLink } from './profileLink'

commandHandler.registerCommand('dotabuff', {
  dbkey: DBSettings.commandDotabuff,
  handler: async (message: MessageType, args: string[], command) => {
    const {
      channel: { name: channelName, client: channelClient },
    } = message

    try {
      if (!args.length && channelClient.steam32Id) {
        chatClient.say(
          channelName,
          t('profileUrl', {
            channel: channelClient.name,
            lng: channelClient.locale,
            url: `dotabuff.com/players/${channelClient.steam32Id}`,
          }),
          message.user.messageId,
        )
        return
      }

      const { hero, playerIdx, player } = await profileLink({
        command,
        packet: channelClient.gsi,
        locale: channelClient.locale,
        args,
      })

      if (player?.accountid) {
        chatClient.say(
          channelName,
          t('profileUrl', {
            channel:
              player?.accountid === channelClient.steam32Id
                ? channelClient.name
                : getHeroNameOrColor(hero?.id ?? 0, playerIdx),
            lng: channelClient.locale,
            url: `dotabuff.com/players/${player.accountid.toString()}`,
          }),
          message.user.messageId,
        )
        return
      }
    } catch (e) {
      chatClient.say(
        message.channel.name,
        (e as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})
