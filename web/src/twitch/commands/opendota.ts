import { DBSettings } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('opendota', {



  dbkey: DBSettings.commandOpendota,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (client.steam32Id && Number(client.steam32Id)) {
      void chatClient.say(
        channel,
        `Here's ${client.name}: opendota.com/players/${client.steam32Id.toString()}`,
      )
      return
    }

    void chatClient.say(channel, 'Unknown steam ID. Play a match first!')
  },
})
