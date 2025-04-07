import { t } from 'i18next'

import { server } from '../../dota/server.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('refresh', {
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (client.token) {
      chatClient.say(
        channel,
        t('refresh', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      server.io.to(client.token).emit('refresh')
    }
  },
})
