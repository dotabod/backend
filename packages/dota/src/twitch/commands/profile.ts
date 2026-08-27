import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { dotabodProfileUrl } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { getDotabodProfileUrl } from '../lib/getDotabodProfile'
import { profileLink } from './profileLink'

commandHandler.registerCommand('profile', {
  onlyOnline: true,
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

      const url = player?.accountid
        ? await getDotabodProfileUrl(client, Number(player.accountid))
        : null
      if (!url) {
        chatClient.say(
          message.channel.name,
          t('dotabodProfileNotFound', {
            lng: client.locale,
            player: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
          }),
          message.user.messageId,
        )
        return
      }

      const desc = t('profileUrl', {
        lng: client.locale,
        channel:
          Number(player?.accountid) === client.steam32Id
            ? client.name
            : getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        url,
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
