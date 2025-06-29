import { checkBotStatus, getTwitchAPI } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { plebMode } from '../../dota/lib/consts.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('pleb', {
  permission: 2,
  dbkey: DBSettings.commandPleb,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId },
    } = message
    if (!(await checkBotStatus())) {
      const api = await getTwitchAPI(process.env.TWITCH_BOT_PROVIDERID!)
      await api.asUser(process.env.TWITCH_BOT_PROVIDERID!, async (ctx) => {
        const settings = await ctx.chat.getSettings(channelId)

        if (!settings.subscriberOnlyModeEnabled) {
          // Tell them they should enable sub only mode before using this command
          chatClient.say(channel, t('plebSubRequired', { lng: message.channel.client.locale }))
          return
        }

        plebMode.add(channelId)
        await ctx.chat.updateSettings(channelId, {
          emoteOnlyModeEnabled: false,
          subscriberOnlyModeEnabled: false,
        })
        chatClient.say(channel, t('pleb', { emote: '👇', lng: message.channel.client.locale }))
      })
    }
    return
  },
})
