import { DBSettings } from '../../db/settings.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { smurfs } from '../../steam/smurfs.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('smurfs', {
  aliases: ['lifetimes', 'totals', 'games'],

  onlyOnline: true,
  dbkey: DBSettings.commandSmurfs,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }
    smurfs(message.channel.client.gsi?.map?.matchid, getCurrentMatchPlayers(client.gsi))
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
