import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { WL_RESET_SETTING_KEY } from '../../db/win-loss-window'
import { gsiHandlers } from '../../dota/lib/consts'
import { server } from '../../dota/server'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('resetwl', {
  cooldown: 0,
  handler: (message: MessageType) => {
    const handler = async function handler() {
      const {
        channel: { name: channel, client },
      } = message
      const resetAt = new Date().toISOString()

      await supabase.from('settings').upsert(
        {
          key: WL_RESET_SETTING_KEY,
          updated_at: resetAt,
          userId: client.token,
          value: resetAt,
        },
        { onConflict: 'userId, key' }
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
        message.user.messageId
      )
      server.io.to(client.token).emit('refresh')

      chatClient.say(
        message.channel.name,
        t('resetwl', {
          channel: message.channel.name,
          lng: message.channel.client.locale,
        }),
        message.user.messageId
      )
    }

    try {
      void handler()
    } catch (error) {
      logger.error('Error in resetwl command', error)
    }
  },
  permission: 2,
})
