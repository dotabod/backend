import { server } from '../../dota/index.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('refresh', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    void chatClient.say(channel, 'Refreshing overlay...')
    server.io.to(client.token).emit('refresh')
  },
})
