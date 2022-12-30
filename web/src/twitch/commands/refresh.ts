import { t } from 'i18next'

import { server } from '../../dota/index.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('refresh', {
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (client.token) {
      void chatClient.say(channel, t('refresh', { lng: message.channel.client.locale }))
      server.io.to(client.token).emit('refresh')
    }
  },
})
