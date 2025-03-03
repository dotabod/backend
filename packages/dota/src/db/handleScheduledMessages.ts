import { chatClient } from '../twitch/chatClient.js'
import { logger } from '../utils/logger.js'
import supabase from './supabase.js'

/**
 * Replaces placeholders in a message with their actual values
 * Currently supported placeholders:
 * - {username}: The Twitch username of the channel
 */
function processMessagePlaceholders(message: string, data: { username: string }): string {
  return message.replace(/\{username\}/g, data.username)
}

/**
 * Sends a message to a user via Twitch chat
 * @param userId The user ID to send the message to
 * @param message The message content to send
 */
async function sendMessageToUser(userId: string, username: string, messageContent: string) {
  try {
    // Get the user's Twitch username from their user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      logger.error(`Error fetching user data for ID ${userId}:`, userError)
      return false
    }

    const username = userData.name

    // Process any placeholders in the message
    const processedMessage = processMessagePlaceholders(messageContent, { username })

    // Send the message via Twitch chat
    if (!chatClient?.say) {
      logger.error('Chat client not initialized')
      return false
    }

    await chatClient.say(username, processedMessage)
    logger.info(`Sent scheduled message to ${username}: ${processedMessage}`)
    return true
  } catch (error) {
    logger.error(`Error sending message to user ${userId}:`, error)
    return false
  }
}

/**
 * Handles scheduled messages for a user
 * This function checks for both regular scheduled messages and messages that should be
 * delivered when a user comes online.
 *
 * @param userId The user ID to process messages for
 * @param isUserOnline Whether the user has just come online (triggers online-specific messages)
 */
export async function handleUserOnlineMessages(userId: string, username: string) {
  try {
    const now = new Date().toISOString()
    const processedMessages = []

    // Find scheduled messages for this specific user that are pending and due to be sent
    const { data: userSpecificMessages, error: userMessagesError } = await supabase
      .from('ScheduledMessage')
      .select('*')
      .eq('userId', userId)
      .lte('sendAt', now)
      .eq('status', 'PENDING')

    if (userMessagesError) {
      logger.error('Error fetching user-specific scheduled messages:', userMessagesError)
      return []
    }

    // Find scheduled messages for all users that are pending and due to be sent
    const { data: globalMessages, error: globalMessagesError } = await supabase
      .from('ScheduledMessage')
      .select('*')
      .eq('isForAllUsers', true)
      .lte('sendAt', now)
      .eq('status', 'PENDING')

    if (globalMessagesError) {
      logger.error('Error fetching global scheduled messages:', globalMessagesError)
      return []
    }

    const allMessages = [...(userSpecificMessages || []), ...(globalMessages || [])]

    if (allMessages.length === 0) {
      return []
    }

    logger.info(`Processing ${allMessages.length} scheduled messages for user ${userId}`)

    for (const message of allMessages) {
      // Check if this message has already been delivered to this user
      const { data: existingDelivery, error: deliveryError } = await supabase
        .from('MessageDelivery')
        .select('*')
        .eq('scheduledMessageId', message.id)
        .eq('userId', userId)
        .single()

      if (deliveryError && deliveryError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" error
        logger.error('Error checking existing delivery:', deliveryError)
        continue
      }

      // Skip if already delivered
      if (existingDelivery) {
        continue
      }

      // Send the message to the user
      const messageSent = await sendMessageToUser(userId, username, message.message)

      if (!messageSent) {
        logger.error(`Failed to send message ${message.id} to user ${userId}`)
        continue
      }

      const now = new Date().toISOString()

      // Create a delivery record
      const { error: createDeliveryError } = await supabase.from('MessageDelivery').insert({
        scheduledMessageId: message.id,
        userId,
        status: 'DELIVERED',
        deliveredAt: now,
        createdAt: now,
        updatedAt: now,
      })

      if (createDeliveryError) {
        logger.error('Error creating delivery record:', createDeliveryError)
        continue
      }

      // For user-specific messages, mark the message as delivered
      if (!message.isForAllUsers) {
        const { error: updateError } = await supabase
          .from('ScheduledMessage')
          .update({ status: 'DELIVERED' })
          .eq('id', message.id)

        if (updateError) {
          logger.error('Error updating message status:', updateError)
        }
      } else {
        // For global messages, check if all users have received it
        const { count: userCount, error: userCountError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })

        if (userCountError) {
          logger.error('Error counting users:', userCountError)
          continue
        }

        const { count: deliveryCount, error: deliveryCountError } = await supabase
          .from('MessageDelivery')
          .select('*', { count: 'exact', head: true })
          .eq('scheduledMessageId', message.id)
          .eq('status', 'DELIVERED')

        if (deliveryCountError) {
          logger.error('Error counting deliveries:', deliveryCountError)
          continue
        }

        // If all users have received it, mark as delivered
        if (deliveryCount && userCount && deliveryCount >= userCount) {
          const { error: updateError } = await supabase
            .from('ScheduledMessage')
            .update({ status: 'DELIVERED' })
            .eq('id', message.id)

          if (updateError) {
            logger.error('Error updating global message status:', updateError)
          }
        }
      }

      processedMessages.push(message)
    }

    return processedMessages
  } catch (error) {
    logger.error('Error handling scheduled messages:', error)
    return []
  }
}
