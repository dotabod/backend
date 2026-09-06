import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('setdelay', {
  aliases: ['delay=', 'setstreamdelay', 'streamdelay='],
  cooldown: 0,
  handler: async (message, args) => {
    if (Number.isNaN(Number(args[0]))) {
      chatClient.say(
        message.channel.name,
        t('setStreamDelayNoArgs', {
          lng: message.channel.client.locale,
        }),
        message.user.messageId
      )

      return
    }

    let delayInSeconds = Number(args[0]) || 0
    if (delayInSeconds > 3000) {
      delayInSeconds = 3000
    } else if (delayInSeconds < 0) {
      delayInSeconds = 0
    }

    await supabase.from('settings').upsert(
      {
        key: DBSettings.streamDelay,
        updated_at: new Date().toISOString(),
        userId: message.channel.client.token,
        value: delayInSeconds * 1000,
      },
      {
        onConflict: 'userId, key',
      }
    )

    chatClient.say(
      message.channel.name,
      delayInSeconds
        ? t('setStreamDelay', {
            lng: message.channel.client.locale,
            seconds: delayInSeconds,
          })
        : t('setStreamDelayRemoved', {
            lng: message.channel.client.locale,
          }),
      message.user.messageId
    )
  },
  permission: 2,
})
