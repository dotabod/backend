export interface TwitchEventTypes {
  // Automod events
  // Notification when message caught by automod for review
  'automod.message.hold': { version: '1' | '2' }
  // Status change for message in automod queue
  'automod.message.update': { version: '1' | '2' }
  // Broadcaster's automod settings updated
  'automod.settings.update': { version: '1' }
  // Broadcaster's public automod terms updated
  'automod.terms.update': { version: '1' }

  // Channel events
  // Channel properties updated (category, title, etc)
  'channel.update': { version: '2' }
  // Channel receives a follow
  'channel.follow': { version: '2' }
  // Midroll commercial break starts
  'channel.ad_break.begin': { version: '1' }
  // All chat messages cleared
  'channel.chat.clear': { version: '1' }
  // All messages from specific user cleared
  'channel.chat.clear_user_messages': { version: '1' }
  // Message sent to chat
  'channel.chat.message': { version: '1' }
  // Specific message removed by moderator
  'channel.chat.message_delete': { version: '1' }
  // Chat event notification
  'channel.chat.notification': { version: '1' }
  // Chat settings updated
  'channel.chat_settings.update': { version: '1' }
  // User's message caught by automod
  'channel.chat.user_message_hold': { version: '1' }
  // User's message automod status updated
  'channel.chat.user_message_update': { version: '1' }
  // Channel joins shared chat session
  'channel.shared_chat.begin': { version: '1' }
  // Shared chat session updated
  'channel.shared_chat.update': { version: '1' }
  // Channel leaves shared chat session
  'channel.shared_chat.end': { version: '1' }

  // Subscription events
  // New subscription received
  'channel.subscribe': { version: '1' }
  // Subscription ends
  'channel.subscription.end': { version: '1' }
  // Gift subscription(s) given
  'channel.subscription.gift': { version: '1' }
  // Resubscription message sent
  'channel.subscription.message': { version: '1' }

  // Channel interaction events
  // Bits cheered
  'channel.cheer': { version: '1' }
  // Channel raided
  'channel.raid': { version: '1' }
  // Viewer banned
  'channel.ban': { version: '1' }
  // Viewer unbanned
  'channel.unban': { version: '1' }
  // Unban request created
  'channel.unban_request.create': { version: '1' }
  // Unban request resolved
  'channel.unban_request.resolve': { version: '1' }

  // Moderation events
  // Moderation action performed
  'channel.moderate': { version: '1' | '2' }
  // Moderator added
  'channel.moderator.add': { version: '1' }
  // Moderator removed
  'channel.moderator.remove': { version: '1' }

  // Guest star events (beta)
  // Guest star session starts
  'channel.guest_star_session.begin': { version: 'beta' }
  // Guest star session ends
  'channel.guest_star_session.end': { version: 'beta' }
  // Guest/slot updated
  'channel.guest_star_guest.update': { version: 'beta' }
  // Guest star preferences updated
  'channel.guest_star_settings.update': { version: 'beta' }

  // Channel points events
  // Automatic reward redeemed
  'channel.channel_points_automatic_reward_redemption.add': { version: '1' }
  // Custom reward created
  'channel.channel_points_custom_reward.add': { version: '1' }
  // Custom reward updated
  'channel.channel_points_custom_reward.update': { version: '1' }
  // Custom reward removed
  'channel.channel_points_custom_reward.remove': { version: '1' }
  // Custom reward redeemed
  'channel.channel_points_custom_reward_redemption.add': { version: '1' }
  // Custom reward redemption updated
  'channel.channel_points_custom_reward_redemption.update': { version: '1' }

  // Poll events
  // Poll started
  'channel.poll.begin': { version: '1' }
  // Poll progress
  'channel.poll.progress': { version: '1' }
  // Poll ended
  'channel.poll.end': { version: '1' }

  // Prediction events
  // Prediction started
  'channel.prediction.begin': { version: '1' }
  // Prediction progress
  'channel.prediction.progress': { version: '1' }
  // Prediction locked
  'channel.prediction.lock': { version: '1' }
  // Prediction ended
  'channel.prediction.end': { version: '1' }

  // Suspicious user events
  // Message from suspicious user
  'channel.suspicious_user.message': { version: '1' }
  // Suspicious user updated
  'channel.suspicious_user.update': { version: '1' }

  // VIP events
  // VIP added
  'channel.vip.add': { version: '1' }
  // VIP removed
  'channel.vip.remove': { version: '1' }

  // Warning events
  // Warning acknowledged
  'channel.warning.acknowledge': { version: '1' }
  // Warning sent
  'channel.warning.send': { version: '1' }

  // Charity events
  // Charity donation received
  'channel.charity_campaign.donate': { version: '1' }
  // Charity campaign started
  'channel.charity_campaign.start': { version: '1' }
  // Charity campaign progress
  'channel.charity_campaign.progress': { version: '1' }
  // Charity campaign stopped
  'channel.charity_campaign.stop': { version: '1' }

  // Conduit events
  // EventSub shard disabled
  'conduit.shard.disabled': { version: '1' }

  // Drop events
  // Drop entitlement granted
  'drop.entitlement.grant': { version: '1' }

  // Extension events
  // Bits transaction for extension
  'extension.bits_transaction.create': { version: '1' }

  // Goal events
  // Goal started
  'channel.goal.begin': { version: '1' }
  // Goal progress
  'channel.goal.progress': { version: '1' }
  // Goal ended
  'channel.goal.end': { version: '1' }

  // Hype Train events
  // Hype Train started
  'channel.hype_train.begin': { version: '1' }
  // Hype Train progress
  'channel.hype_train.progress': { version: '1' }
  // Hype Train ended
  'channel.hype_train.end': { version: '1' }

  // Shield Mode events
  // Shield Mode activated
  'channel.shield_mode.begin': { version: '1' }
  // Shield Mode deactivated
  'channel.shield_mode.end': { version: '1' }

  // Shoutout events
  // Shoutout sent
  'channel.shoutout.create': { version: '1' }
  // Shoutout received
  'channel.shoutout.receive': { version: '1' }

  // Stream events
  // Stream started
  'stream.online': { version: '1' }
  // Stream ended
  'stream.offline': { version: '1' }

  // User events
  // Authorization granted
  'user.authorization.grant': { version: '1' }
  // Authorization revoked
  'user.authorization.revoke': { version: '1' }
  // User account updated
  'user.update': { version: '1' }
  // Whisper received
  'user.whisper.message': { version: '1' }
}
