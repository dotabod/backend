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
    const streamOnline = client.stream_online

    if ((streamOnline && isOnlineCommand) || (!streamOnline && !isOnlineCommand)) {
      const state = streamOnline ? 'online' : 'offline'
      const oppositeCommand = isOnlineCommand ? 'offline' : 'online'

      notifyStreamStatus(message.channel.name, client.locale, state, oppositeCommand)
      refreshSettings(client.token)
      return
    }

    await updateStreamStatus(client.token, isOnlineCommand)

    refreshSettings(client.token)
    notifyStreamStatus(message.channel.name, client.locale, '', isOnlineCommand ? 'on' : 'off')
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
      state: t(state, { lng: locale }),
      command,
      context,
    }),
  )
}

const refreshSettings = (token: string) => {
  server.io.to(token).emit('refresh-settings')
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
