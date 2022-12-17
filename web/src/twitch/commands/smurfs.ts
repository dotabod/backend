import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { smurfs } from '../../steam/smurfs.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from '../index.js'

commandHandler.registerCommand('smurfs', {
  aliases: ['lifetimes', 'totals'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!getValueOrDefault(DBSettings.commandSmurfs, client.settings)) {
      return
    }

    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }
    smurfs(message.channel.client.gsi?.map?.matchid)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
