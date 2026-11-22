import { captureCosmetics } from '../../dota/lib/capture-cosmetics'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import type { CommandDefinition } from '../lib/command-handler.ts'
import { runSetCommand } from './set-handler'

const setCommandDependencies = {
  captureCosmetics,
  say: chatClient.say,
}

export const setCommand: CommandDefinition = {
  aliases: ['cosmetics', 'loadout'],
  dbkey: DBSettings.commandSet,
  handler: async (message) => {
    await runSetCommand(message, setCommandDependencies)
  },
  name: 'set',
  onlyOnline: true,
}
