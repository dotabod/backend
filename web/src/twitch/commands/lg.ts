import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import lastgame from '../../steam/lastgame.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('lg', {
  aliases: ['lastgame'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!getValueOrDefault(DBSettings.commandLG, client.settings)) {
      return
    }
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }

    lastgame(message.channel.client.steam32Id)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
