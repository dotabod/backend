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
      void chatClient.say(channel, 'Refreshing overlay...')
      server.io.to(client.token).emit('refresh')
    }
  },
})
