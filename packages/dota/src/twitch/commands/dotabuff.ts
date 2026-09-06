import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { dotabodProfileUrl } from '../../utils/index'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'
import { getDotabodProfileUrl } from '../lib/get-dotabod-profile'
import { profileLink } from './profile-link'

commandHandler.registerCommand('dotabuff', {
  dbkey: DBSettings.commandDotabuff,
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
          message.user.messageId
        )
        return
      }

      const { hero, playerIdx, player } = await profileLink({
        args,
        client: channelClient,
        command,
        locale: channelClient.locale,
      })

      if (player?.accountid !== null && player?.accountid !== undefined && player.accountid !== 0) {
        const url = await getDotabodProfileUrl(channelClient, Number(player.accountid))
        if (url === null || url.length === 0) {
          chatClient.say(
            channelName,
            t('dotabodProfileNotFound', {
              lng: channelClient.locale,
              player: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
            }),
            message.user.messageId
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
          message.user.messageId
        )
      }
    } catch (error) {
      chatClient.say(
        message.channel.name,
        error instanceof Error
          ? error.message
          : t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
    }
  },
})
