import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { WL_RESET_SETTING_KEY } from '../../db/winLossWindow'
import { gsiHandlers } from '../../dota/lib/consts'
import { server } from '../../dota/server'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('resetwl', {
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, _args: string[]) => {
    async function handler() {
      const {
        channel: { name: channel, client },
      } = message
      const resetAt = new Date().toISOString()

      await supabase.from('settings').upsert(
        {
          key: WL_RESET_SETTING_KEY,
          userId: client.token,
          updated_at: resetAt,
          value: resetAt,
        },
        { onConflict: 'userId, key' },
      )

      const resetSetting = client.settings.find((setting) => setting.key === WL_RESET_SETTING_KEY)
      if (resetSetting) {
        resetSetting.value = resetAt
      } else {
        client.settings.push({ key: WL_RESET_SETTING_KEY, value: resetAt })
      }
      gsiHandlers.get(client.token)?.emitWLUpdate()

      chatClient.say(
        channel,
        t('refresh', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      if (server?.io) {
        server.io.to(client.token).emit('refresh')
      }

      chatClient.say(
        message.channel.name,
        t('resetwl', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
        }),
        message.user.messageId,
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in resetwl command', e)
    }
  },
})
