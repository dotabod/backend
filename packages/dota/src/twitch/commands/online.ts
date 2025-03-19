import { t } from 'i18next'
import supabase from '../../db/supabase.js'
import { server } from '../../dota/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('online', {
  aliases: ['offline'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args, command) => {
    const {
      channel: { client },
    } = message

    const isOnlineCommand = command === 'online'
    const oppositeCommand = isOnlineCommand ? 'offline' : 'online'
    const state = isOnlineCommand
      ? t('online', { lng: client.locale })
      : t('offline', { lng: client.locale })

    const streamOnline = client.stream_online
    if ((!streamOnline && isOnlineCommand) || (streamOnline && !isOnlineCommand)) {
      notifyStreamStatus(
        message.channel.name,
        client.locale,
        state,
        oppositeCommand,
        isOnlineCommand ? 'on' : 'off',
      )
      // client.stream_online = isOnlineCommand
      refreshSettings(client.token)
      await updateStreamStatus(client.token, isOnlineCommand)
      return
    }

    notifyStreamStatus(message.channel.name, client.locale, state, oppositeCommand)
  },
})

const notifyStreamStatus = (
  channelName: string,
  locale: string,
  state: string,
  command?: string,
  context = 'none',
) => {
  chatClient.say(
    channelName,
    t('stream', {
      lng: locale,
      channel: channelName,
      state,
      command,
      context,
    }),
  )
}

export const refreshSettings = (token: string) => {
  server.io.to(token).emit('refresh-settings', 'mutate')
}

const updateStreamStatus = async (token: string, isOnline: boolean) => {
  await supabase
    .from('users')
    .update({
      stream_online: isOnline,
      stream_start_date: null,
    })
    .eq('id', token)
}
