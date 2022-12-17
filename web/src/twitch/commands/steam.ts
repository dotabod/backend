import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from '../index.js'

commandHandler.registerCommand('steam', {
  aliases: ['steamid', 'account'],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    // TODO: whispers do not work via chatClient, have to use helix api
    // helix api rate limits you to 40 unique whispers a day though ?? so just not gonna do it
    void chatClient.say(
      channel,
      `https://steamid.xyz/${client.steam32Id ?? ' Unknown steam ID. Play a match first!'}`,
    )
  },
})
