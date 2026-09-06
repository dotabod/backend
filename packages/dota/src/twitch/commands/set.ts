import { captureCosmetics } from '../../dota/lib/capture-cosmetics'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { runSetCommand } from './set-handler'

const setCommandDependencies = {
  captureCosmetics,
  say: chatClient.say,
}

commandHandler.registerCommand('set', {
  aliases: ['cosmetics', 'loadout'],
  dbkey: DBSettings.commandSet,
  handler: async (message) => {
    await runSetCommand(message, setCommandDependencies)
  },
  onlyOnline: true,
})
