import { server } from '../../dota/index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('refresh', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (client.sockets.length) {
      void chatClient.say(channel, 'Refreshing overlay...')
      server.io.to(client.sockets).emit('refresh')
    } else {
      void chatClient.say(channel, 'Not live PauseChamp')
    }
  },
})
