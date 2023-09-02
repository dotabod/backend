import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { server } from '../../dota/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('online', {
  aliases: ['offline', 'forceonline', 'forceoffline'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    const forceOnline = command === 'forceonline' || command === 'online'
    if (message.channel.client.stream_online === forceOnline) {
      chatClient.say(
        message.channel.name,
        t('stream', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
          state: message.channel.client.stream_online
            ? t('online', { lng: message.channel.client.locale })
            : t('offline', { lng: message.channel.client.locale }),
          command: message.channel.client.stream_online ? 'offline' : 'online',
          context: 'none',
        }),
      )

      server.io.to(client.token).emit('refresh-settings')
      return
    }

    await supabase
      .from('users')
      .update({
        stream_online: forceOnline,
        stream_start_date: null,
      })
      .eq('id', message.channel.client.token)

    if (forceOnline) {
      chatClient.say(channel, t('refresh', { lng: message.channel.client.locale }))
      server.io.to(client.token).emit('refresh-settings')
    }

    chatClient.say(
      message.channel.name,
      t('stream', {
        lng: message.channel.client.locale,
        channel: message.channel.name,
        context: message.channel.client.stream_online ? 'off' : 'on',
      }),
    )
  },
})
