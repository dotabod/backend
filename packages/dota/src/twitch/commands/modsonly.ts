import { checkBotStatus, getTwitchAPI } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { modMode } from '../../dota/lib/consts'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('modsonly', {
  aliases: ['modsonlyoff', 'modsonlyon'],
  permission: 2,
  cooldown: 0,
  dbkey: DBSettings.commandModsonly,
  handler: async (message: MessageType, _args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (modMode.has(channelId)) {
      modMode.delete(channelId)
      chatClient.say(
        channel,
        t('modsOnly', { context: 'off', lng: client.locale }),
        message.user.messageId,
      )
      if (!(await checkBotStatus())) {
        const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID!)
        await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
          await ctx.chat.updateSettings(channelId, {
            emoteOnlyModeEnabled: false,
            subscriberOnlyModeEnabled: false,
          })
        })
      }
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    if (!(await checkBotStatus())) {
      const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID!)
      await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
        await ctx.chat.updateSettings(channelId, {
          emoteOnlyModeEnabled: true,
          subscriberOnlyModeEnabled: true,
        })
      })
    }
    chatClient.say(
      channel,
      t('modsOnly', { emote: 'BASED Clap', context: 'on', lng: client.locale }),
      message.user.messageId,
    )
  },
})
