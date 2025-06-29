import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('setdelay', {
  aliases: ['delay=', 'setstreamdelay', 'streamdelay='],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
    if (Number.isNaN(Number(args[0]))) {
      chatClient.say(
        message.channel.name,
        t('setStreamDelayNoArgs', {
          lng: message.channel.client.locale,
        }),
        message.user.messageId,
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
        userId: message.channel.client.token,
        key: DBSettings.streamDelay,
        value: delayInSeconds * 1000,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'userId, key',
      },
    )

    chatClient.say(
      message.channel.name,
      !delayInSeconds
        ? t('setStreamDelayRemoved', {
            lng: message.channel.client.locale,
          })
        : t('setStreamDelay', {
            lng: message.channel.client.locale,
            seconds: delayInSeconds,
          }),
      message.user.messageId,
    )
  },
})
