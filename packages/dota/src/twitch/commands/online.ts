import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { server } from '../../dota/server'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

const notifyStreamStatus = function notifyStreamStatus(
  channelName: string,
  locale: string,
  state: string,
  command?: string,
  context = 'none'
): void {
  chatClient.say(
    channelName,
    t('stream', {
      channel: channelName,
      command,
      context,
      lng: locale,
      state,
    })
  )
}

export const refreshSettings = function refreshSettings(token: string): void {
  server.io.to(token).emit('refresh-settings', 'mutate')
}

const updateStreamStatus = async function updateStreamStatus(
  token: string,
  isOnline: boolean
): Promise<void> {
  await supabase
    .from('users')
    .update({
      stream_online: isOnline,
      stream_start_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', token)
}

commandHandler.registerCommand('online', {
  aliases: ['offline'],
  cooldown: 0,
  handler: async (message, _args, command) => {
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
        isOnlineCommand ? 'on' : 'off'
      )
      await updateStreamStatus(client.token, isOnlineCommand)
      refreshSettings(client.token)
      return
    }

    notifyStreamStatus(message.channel.name, client.locale, state, oppositeCommand)
    refreshSettings(client.token)
  },
  permission: 2,
})
