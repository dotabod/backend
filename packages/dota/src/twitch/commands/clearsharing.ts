import { commandDisable } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { redisClient } from '../../db/redisInstance'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('clearsharing', {
  aliases: ['forcelink'],
  permission: 2,
  cooldown: 30,
  handler: async (message, _args) => {
    const {
      channel: { client },
    } = message

    const userId = message.channel.client.token

    try {
      // Clear Redis tracking of active Steam accounts for this token
      const redisKey = `token:${userId}:activeSteam32Ids`
      await redisClient.client.del(redisKey)

      // Only resolve ACCOUNT_SHARING audit rows — leaves unrelated
      // CHAT_PERMISSION_DENIED / TOKEN_REVOKED notifications intact.
      await commandDisable.enable(userId, { reason: 'ACCOUNT_SHARING' })

      // Send success message with updated warning
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.success', { lng: client.locale }),
        message.user.messageId,
      )
    } catch (_error) {
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.error', { lng: client.locale }),
        message.user.messageId,
      )
    }
  },
})
