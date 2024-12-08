import { eventSubMap } from './chatSubIds.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchEventSubResponse } from './interfaces.js'
import { logger } from './twitch/lib/logger.js'

// Constants
const headers = await getTwitchHeaders()

const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (!botUserId) {
  throw new Error('Bot user id not found')
}

export interface TwitchEventTypes {
  // Automod events
  'automod.message.hold': { version: '1' | '2' } // Notification when message caught by automod for review
  'automod.message.update': { version: '1' | '2' } // Status change for message in automod queue
  'automod.settings.update': { version: '1' } // Broadcaster's automod settings updated
  'automod.terms.update': { version: '1' } // Broadcaster's public automod terms updated

  // Channel events
  'channel.update': { version: '2' } // Channel properties updated (category, title, etc)
  'channel.follow': { version: '2' } // Channel receives a follow
  'channel.ad_break.begin': { version: '1' } // Midroll commercial break starts
  'channel.chat.clear': { version: '1' } // All chat messages cleared
  'channel.chat.clear_user_messages': { version: '1' } // All messages from specific user cleared
  'channel.chat.message': { version: '1' } // Message sent to chat
  'channel.chat.message_delete': { version: '1' } // Specific message removed by moderator
  'channel.chat.notification': { version: '1' } // Chat event notification
  'channel.chat_settings.update': { version: '1' } // Chat settings updated
  'channel.chat.user_message_hold': { version: '1' } // User's message caught by automod
  'channel.chat.user_message_update': { version: '1' } // User's message automod status updated
  'channel.shared_chat.begin': { version: '1' } // Channel joins shared chat session
  'channel.shared_chat.update': { version: '1' } // Shared chat session updated
  'channel.shared_chat.end': { version: '1' } // Channel leaves shared chat session

  // Subscription events
  'channel.subscribe': { version: '1' } // New subscription received
  'channel.subscription.end': { version: '1' } // Subscription ends
  'channel.subscription.gift': { version: '1' } // Gift subscription(s) given
  'channel.subscription.message': { version: '1' } // Resubscription message sent

  // Channel interaction events
  'channel.cheer': { version: '1' } // Bits cheered
  'channel.raid': { version: '1' } // Channel raided
  'channel.ban': { version: '1' } // Viewer banned
  'channel.unban': { version: '1' } // Viewer unbanned
  'channel.unban_request.create': { version: '1' } // Unban request created
  'channel.unban_request.resolve': { version: '1' } // Unban request resolved

  // Moderation events
  'channel.moderate': { version: '1' | '2' } // Moderation action performed
  'channel.moderator.add': { version: '1' } // Moderator added
  'channel.moderator.remove': { version: '1' } // Moderator removed

  // Guest star events (beta)
  'channel.guest_star_session.begin': { version: 'beta' } // Guest star session starts
  'channel.guest_star_session.end': { version: 'beta' } // Guest star session ends
  'channel.guest_star_guest.update': { version: 'beta' } // Guest/slot updated
  'channel.guest_star_settings.update': { version: 'beta' } // Guest star preferences updated

  // Channel points events
  'channel.channel_points_automatic_reward_redemption.add': { version: '1' } // Automatic reward redeemed
  'channel.channel_points_custom_reward.add': { version: '1' } // Custom reward created
  'channel.channel_points_custom_reward.update': { version: '1' } // Custom reward updated
  'channel.channel_points_custom_reward.remove': { version: '1' } // Custom reward removed
  'channel.channel_points_custom_reward_redemption.add': { version: '1' } // Custom reward redeemed
  'channel.channel_points_custom_reward_redemption.update': { version: '1' } // Custom reward redemption updated

  // Poll events
  'channel.poll.begin': { version: '1' } // Poll started
  'channel.poll.progress': { version: '1' } // Poll progress
  'channel.poll.end': { version: '1' } // Poll ended

  // Prediction events
  'channel.prediction.begin': { version: '1' } // Prediction started
  'channel.prediction.progress': { version: '1' } // Prediction progress
  'channel.prediction.lock': { version: '1' } // Prediction locked
  'channel.prediction.end': { version: '1' } // Prediction ended

  // Suspicious user events
  'channel.suspicious_user.message': { version: '1' } // Message from suspicious user
  'channel.suspicious_user.update': { version: '1' } // Suspicious user updated

  // VIP events
  'channel.vip.add': { version: '1' } // VIP added
  'channel.vip.remove': { version: '1' } // VIP removed

  // Warning events
  'channel.warning.acknowledge': { version: '1' } // Warning acknowledged
  'channel.warning.send': { version: '1' } // Warning sent

  // Charity events
  'channel.charity_campaign.donate': { version: '1' } // Charity donation received
  'channel.charity_campaign.start': { version: '1' } // Charity campaign started
  'channel.charity_campaign.progress': { version: '1' } // Charity campaign progress
  'channel.charity_campaign.stop': { version: '1' } // Charity campaign stopped

  // Conduit events
  'conduit.shard.disabled': { version: '1' } // EventSub shard disabled

  // Drop events
  'drop.entitlement.grant': { version: '1' } // Drop entitlement granted

  // Extension events
  'extension.bits_transaction.create': { version: '1' } // Bits transaction for extension

  // Goal events
  'channel.goal.begin': { version: '1' } // Goal started
  'channel.goal.progress': { version: '1' } // Goal progress
  'channel.goal.end': { version: '1' } // Goal ended

  // Hype Train events
  'channel.hype_train.begin': { version: '1' } // Hype Train started
  'channel.hype_train.progress': { version: '1' } // Hype Train progress
  'channel.hype_train.end': { version: '1' } // Hype Train ended

  // Shield Mode events
  'channel.shield_mode.begin': { version: '1' } // Shield Mode activated
  'channel.shield_mode.end': { version: '1' } // Shield Mode deactivated

  // Shoutout events
  'channel.shoutout.create': { version: '1' } // Shoutout sent
  'channel.shoutout.receive': { version: '1' } // Shoutout received

  // Stream events
  'stream.online': { version: '1' } // Stream started
  'stream.offline': { version: '1' } // Stream ended

  // User events
  'user.authorization.grant': { version: '1' } // Authorization granted
  'user.authorization.revoke': { version: '1' } // Authorization revoked
  'user.update': { version: '1' } // User account updated
  'user.whisper.message': { version: '1' } // Whisper received
}

export async function genericSubscribe(
  conduit_id: string,
  broadcaster_user_id: string,
  type: keyof TwitchEventTypes,
) {
  const body = {
    type,
    version: '1',
    condition: {
      user_id: botUserId,
      broadcaster_user_id: broadcaster_user_id, // the user we want to listen to
    },
    transport: {
      method: 'conduit',
      conduit_id,
    },
  }
  const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (subscribeReq.status === 409) {
    logger.info(`Subscription already exists for ${type}`, { type })
    return true
  }

  if (subscribeReq.status !== 202) {
    logger.error(`Failed to subscribe ${subscribeReq.status} ${await subscribeReq.text()}`, {
      type,
    })
    return false
  }

  const { data }: TwitchEventSubResponse = await subscribeReq.json()

  if (
    broadcaster_user_id === '__proto__' ||
    broadcaster_user_id === 'constructor' ||
    broadcaster_user_id === 'prototype'
  ) {
    logger.error(`Invalid broadcaster_user_id: ${broadcaster_user_id}`, { type })
    return false
  }

  eventSubMap[broadcaster_user_id][type] = { status: data[0].status, id: data[0].id }
  return true
}

export async function subscribeToAuthRevoke(conduit_id: string, client_id: string) {
  const body = {
    type: 'user.authorization.revoke' as const,
    version: '1',
    condition: {
      client_id,
    },
    transport: {
      method: 'conduit',
      conduit_id,
    },
  }

  const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (subscribeReq.status === 409) {
    logger.info('Subscription already exists for user.authorization.revoke')
    return true
  }

  if (subscribeReq.status !== 202) {
    logger.error(`Failed to subscribe ${subscribeReq.status} ${await subscribeReq.text()}`, {
      type: 'user.authorization.revoke',
    })
    return false
  }

  return true
}
