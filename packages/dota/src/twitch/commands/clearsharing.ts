import { trackResolveReason } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { redisClient } from '../../db/redisInstance.js'
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
      // Clear Redis tracking of active Steam accounts for this token
      const redisKey = `token:${userId}:activeSteam32Ids`
      await redisClient.client.del(redisKey)

      // Resolve any ACCOUNT_SHARING notifications for this user
      await trackResolveReason(userId, DBSettings.commandDisable, false)

      // Send success message with updated warning
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.success', { lng: client.locale }),
        message.user.messageId,
      )
    } catch (error) {
      const channel = message.channel.client.name
      chatClient.say(
        channel,
        t('clearsharing.error', { lng: client.locale }),
        message.user.messageId,
      )
    }
  },
})
