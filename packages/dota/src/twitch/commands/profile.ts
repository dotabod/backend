import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { dotabodProfileUrl } from '../../utils/index'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { getDotabodProfileUrl } from '../lib/get-dotabod-profile'
import { profileLink } from './profile-link'

commandHandler.registerCommand('profile', {
  dbkey: DBSettings.commandProfile,
  handler: async (message, args, command) => {
    const {
      channel: { client },
    } = message

    try {
      if (!args.length) {
        chatClient.say(
          message.channel.name,
          t('profileUrl', {
            channel: message.channel.client.name,
            lng: message.channel.client.locale,
            url: dotabodProfileUrl(message.channel.client.name),
          }),
          message.user.messageId
        )
        return
      }

      const { hero, playerIdx, player } = await profileLink({
        args,
        client,
        command,
        locale: client.locale,
      })

      const url =
        player?.accountid !== null && player?.accountid !== undefined && player.accountid !== 0
          ? await getDotabodProfileUrl(client, Number(player.accountid))
          : null
      if (url === null || url.length === 0) {
        chatClient.say(
          message.channel.name,
          t('dotabodProfileNotFound', {
            lng: client.locale,
            player: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
          }),
          message.user.messageId
        )
        return
      }

      const desc = t('profileUrl', {
        channel:
          Number(player?.accountid) === client.steam32Id
            ? client.name
            : getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        lng: client.locale,
        url,
      })

      chatClient.say(message.channel.name, desc, message.user.messageId)
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
  onlyOnline: true,
})
