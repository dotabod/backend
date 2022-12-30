import { DBSettings } from '../../db/settings.js'
import { calculateAvg } from '../../dota/lib/calculateAvg.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('avg', {



  onlyOnline: true,
  dbkey: DBSettings.commandAvg,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }

    calculateAvg(message.channel.client.gsi?.map?.matchid, getCurrentMatchPlayers(client.gsi))
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
