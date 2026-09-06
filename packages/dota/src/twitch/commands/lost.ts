import { DBSettings } from '../../settings'
import commandHandler from '../lib/command-handler'
import { handleManualResolution } from '../lib/manual-resolution-handler'

commandHandler.registerCommand('lost', {
  cooldown: 0,
  dbkey: DBSettings.commandLost,
  handler: async (message, args) => {
    await handleManualResolution(message, args, 'lost')
  },
  // Mods and broadcaster only,
  permission: 2,
})
