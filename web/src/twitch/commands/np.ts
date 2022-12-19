import { DBSettings } from '../../db/settings.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('np', {
  aliases: ['players', 'who'],
  permission: 0,
  cooldown: 15000,
  dbkey: DBSettings.commandNP,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }

    const matchPlayers = getCurrentMatchPlayers(client.gsi)
    notablePlayers(client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
