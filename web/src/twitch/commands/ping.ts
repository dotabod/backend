import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

// Register a "ping" command that sends a "pong" message to the chat
commandHandler.registerCommand('ping', {
  // The "ping" command requires no special permission
  // The "ping" command has a cooldown of 15 seconds
  handler: (message: MessageType, args: string[]) => {
    // Send a "pong" message to the chat
    void chatClient.say(message.channel.name, 'Pong EZ Clap')
  },
})
