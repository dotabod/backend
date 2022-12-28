import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('fixdbl', {
  aliases: ['fixdd'],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    // Nothing yet
  },
})
