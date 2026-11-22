import { t } from 'i18next'

import { clearAccountSharing } from '../../dota/lib/account-sharing.js'
import { chatClient } from '../chat-client'
import type { CommandDefinition } from '../lib/command-handler.ts'

export const clearsharingCommand: CommandDefinition = {
  aliases: ['forcelink'],
  cooldown: 30,
  handler: async (message) => {
    const {
      channel: { client },
    } = message

    try {
      await clearAccountSharing(client.token)

      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.success', { lng: client.locale }),
        message.user.messageId
      )
    } catch {
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.error', { lng: client.locale }),
        message.user.messageId
      )
    }
  },
  name: 'clearsharing',
  permission: 2,
}
