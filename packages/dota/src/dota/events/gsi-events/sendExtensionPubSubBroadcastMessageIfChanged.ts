import { sendExtensionPubSubBroadcastMessage } from '@twurple/ebs-helper'
import type { GSIHandler } from '../../GSIHandler'
import { redisClient } from '../../../db/redisInstance.js'

export const sendExtensionPubSubBroadcastMessageIfChanged = async (
  dotaClient: GSIHandler,
  messageToSend: any,
) => {
  const { client } = dotaClient
  const redisKey = `${client.token}:lastMessage`

  // Retrieve the previous message from Redis
  const prevMessageString = await redisClient.client.get(redisKey)

  // Convert the current message to a string for comparison
  const currentMessageString = JSON.stringify(messageToSend)

  // Compare the current message with the previous one
  if (currentMessageString !== prevMessageString) {
    const accountId = client.Account?.providerAccountId ?? ''
    if (!accountId) return

    // If different, send the message and update Redis
    await sendExtensionPubSubBroadcastMessage(tooltipsConfig, accountId, currentMessageString)
    await redisClient.client.set(redisKey, currentMessageString)
  }
}

export const tooltipsConfig = {
  clientId: process.env.TWITCH_EXT_CLIENT_ID || '',
  secret: process.env.TWITCH_EXT_SECRET || '',
  ownerId: process.env.TWITCH_BOT_PROVIDERID || '',
}
