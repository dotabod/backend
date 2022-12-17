import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('match', {
  aliases: ['matchid'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchid = client.gsi?.map?.matchid

    if (!matchid) {
      void chatClient.say(channel, 'Match ID: Unknown')
      return
    }

    void chatClient.say(channel, `Match ID: ${matchid}`)
  },
})
