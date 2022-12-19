import { DBSettings } from '../../db/settings.js'
import lastgame from '../../steam/lastgame.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('lg', {
  aliases: ['lastgame'],
  permission: 0,
  cooldown: 15000,
  dbkey: DBSettings.commandLG,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
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
