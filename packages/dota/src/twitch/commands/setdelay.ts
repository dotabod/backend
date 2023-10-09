import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('setdelay', {
  aliases: ['delay=', 'setstreamdelay', 'streamdelay='],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
    if (isNaN(Number(args[0]))) {
      chatClient.say(
        message.channel.name,
        t('setStreamDelayNoArgs', {
          lng: message.channel.client.locale,
        }),
      )

      return
    }

    await supabase.from('settings').upsert(
      {
        userId: message.channel.client.token,
        key: DBSettings.streamDelay,
        value: (Number(args[0]) || 0) * 1000,
      },
      {
        onConflict: 'userId, key',
      },
    )

    chatClient.say(
      message.channel.name,
      !(Number(args[0]) || 0)
        ? t('setStreamDelayRemoved', {
            lng: message.channel.client.locale,
          })
        : t('setStreamDelay', {
            lng: message.channel.client.locale,
            seconds: Number(args[0]) || 0,
          }),
    )
  },
})
