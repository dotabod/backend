import { t } from 'i18next'

import { server } from '../../dota/server'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('refresh', {
  handler: (message: MessageType, _args: string[]) => {
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

  permission: 2,
})
