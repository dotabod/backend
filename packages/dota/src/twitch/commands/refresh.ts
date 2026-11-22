import { t } from 'i18next'

import { server } from '../../dota/server'
import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const refreshCommand: CommandDefinition = {
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message
    if (client.token) {
      chatClient.say(
        channel,
        t('refresh', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      server.io.to(client.token).emit('refresh')
    }
  },

  name: 'refresh',
  permission: 2,
}
