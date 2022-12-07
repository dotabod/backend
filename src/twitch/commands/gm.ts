import { gameMedals } from '../../steam/medals.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('gm', {
  aliases: [],
  permission: 0,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }
    gameMedals(message.channel.client.steam32Id)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
