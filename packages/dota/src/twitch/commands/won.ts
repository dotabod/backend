import { DBSettings } from '../../settings'
import type { CommandDefinition } from '../lib/command-handler.ts'
import { handleManualResolution } from '../lib/manual-resolution-handler'

export const wonCommand: CommandDefinition = {
  cooldown: 0,
  dbkey: DBSettings.commandWon,
  handler: async (message, args) => {
    await handleManualResolution(message, args, 'won')
  },
  // Mods and broadcaster only,
  name: 'won',
  permission: 2,
}
