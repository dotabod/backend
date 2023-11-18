import { t } from 'i18next'

import { server } from '../../dota/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('refresh', {
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (client.token) {
      chatClient.say(message.channel.name, t('refresh', { lng: message.channel.client.locale }))
      server.io.to(client.token).emit('refresh')
    }
  },
})
