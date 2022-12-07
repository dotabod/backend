import { gameMedals } from '../../steam/medals.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('np', {
  aliases: ['players', 'who'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }

    notablePlayers(message.channel.client.steam32Id)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
