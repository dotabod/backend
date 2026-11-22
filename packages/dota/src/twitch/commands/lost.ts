import { DBSettings } from '../../settings'
import type { CommandDefinition } from '../lib/command-handler.ts'
import { handleManualResolution } from '../lib/manual-resolution-handler'

export const lostCommand: CommandDefinition = {
  cooldown: 0,
  dbkey: DBSettings.commandLost,
  handler: async (message, args) => {
    await handleManualResolution(message, args, 'lost')
  },
  // Mods and broadcaster only,
  name: 'lost',
  permission: 2,
}
