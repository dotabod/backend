import { DBSettings } from '../../settings'
import commandHandler from '../lib/command-handler'
import { handleManualResolution } from '../lib/manual-resolution-handler'

commandHandler.registerCommand('won', {
  cooldown: 0,
  dbkey: DBSettings.commandWon,
  handler: async (message, args) => {
    await handleManualResolution(message, args, 'won')
  },
  // Mods and broadcaster only,
  permission: 2,
})
