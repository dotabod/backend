import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { dotabodProfileUrl } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'
import { getDotabodProfileUrl } from '../lib/getDotabodProfile'
import { profileLink } from './profileLink'

commandHandler.registerCommand('opendota', {
  dbkey: DBSettings.commandOpendota,
  handler: async (message: MessageType, args: string[], command) => {
    const {
      channel: { name: channelName, client: channelClient },
    } = message

    try {
      if (!args.length) {
        chatClient.say(
          channelName,
          t('profileUrl', {
            channel: channelClient.name,
            lng: channelClient.locale,
            url: dotabodProfileUrl(channelClient.name),
          }),
          message.user.messageId,
        )
        return
      }

      const { hero, playerIdx, player } = await profileLink({
        command,
        client: channelClient,
        locale: channelClient.locale,
        args: args,
      })

      if (player?.accountid) {
        const url = await getDotabodProfileUrl(channelClient, Number(player.accountid))
        if (!url) {
          chatClient.say(
            channelName,
            t('dotabodProfileNotFound', {
              lng: channelClient.locale,
              player: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
            }),
            message.user.messageId,
          )
          return
        }

        chatClient.say(
          channelName,
          t('profileUrl', {
            channel:
              Number(player?.accountid) === channelClient.steam32Id
                ? channelClient.name
                : getHeroNameOrColor(hero?.id ?? 0, playerIdx),
            lng: channelClient.locale,
            url,
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
