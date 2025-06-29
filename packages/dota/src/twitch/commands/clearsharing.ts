import { trackResolveReason } from '@dotabod/shared-utils'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('clearsharing', {
  aliases: ['forcelink'],
  permission: 2,
  cooldown: 30,
  handler: async (message, args) => {
    const {
      channel: { client },
    } = message

    const userId = message.channel.client.token

    try {
      // Resolve the ACCOUNT_SHARING disable reason for commandDisable setting
      await trackResolveReason(userId, DBSettings.commandDisable, false)

      // Send success message with warning
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        'Account sharing disable cleared. WARNING: If the Dotabod GSI config file still exists on another PC, this account will be automatically disabled again when both are used simultaneously. You MUST delete the GSI file from the other PC to prevent this issue.',
        message.user.messageId,
      )
    } catch (error) {
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        'Failed to clear account sharing disable. Please try again or contact support.',
        message.user.messageId,
      )
    }
  },
})
