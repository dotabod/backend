import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { gameMedals } from '../../steam/medals.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('gm', {
  aliases: ['medals', 'ranks'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!getValueOrDefault(DBSettings.commandGM, client.settings)) {
      return
    }
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }
    gameMedals(message.channel.client.gsi?.map?.matchid)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
