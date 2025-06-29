import supabase from '../db/supabase.js'
import { logger } from '../logger.js'
import type { DisableReason, DisableReasonMetadata } from './types.js'

/**
 * Track when a setting is disabled and why
 */
export async function trackDisableReason(
  userId: string,
  settingKey: string,
  reason: DisableReason,
  metadata?: DisableReasonMetadata,
): Promise<void> {
  try {
    const now = new Date()

    // Update the setting with disable reason info
    await supabase.from('settings').upsert(
      {
        userId,
        key: settingKey,
        value: false, // Disabled
        disable_reason: reason,
        auto_disabled_at: now.toISOString(),
        auto_disabled_by: 'system',
        disable_metadata: metadata || {},
        updated_at: now.toISOString(),
      },
      {
        onConflict: 'userId, key',
      },
    )

    // Create a disable notification
    await supabase.from('disable_notifications').insert({
      user_id: userId,
      setting_key: settingKey,
      reason,
      metadata: metadata || {},
      created_at: now.toISOString(),
    })

    logger.info('[DISABLE_REASON] Tracked disable reason', {
      userId,
      settingKey,
      reason,
      metadata,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to track disable reason', {
      userId,
      settingKey,
      reason,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Track when a setting is enabled/resolved
 */
export async function trackResolveReason(
  userId: string,
  settingKey: string,
  autoResolved = false,
): Promise<void> {
  try {
    const now = new Date()

    // Clear disable reason from setting
    await supabase
      .from('settings')
      .update({
        disable_reason: null,
        auto_disabled_at: null,
        auto_disabled_by: null,
        disable_metadata: null,
        updated_at: now.toISOString(),
      })
      .eq('userId', userId)
      .eq('key', settingKey)

    // Mark notifications as resolved
    await supabase
      .from('disable_notifications')
      .update({
        resolved_at: now.toISOString(),
        auto_resolved: autoResolved,
      })
      .eq('user_id', userId)
      .eq('setting_key', settingKey)
      .is('resolved_at', null)

    logger.info('[DISABLE_REASON] Resolved disable reason', {
      userId,
      settingKey,
      autoResolved,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to resolve disable reason', {
      userId,
      settingKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get all unresolved disable reasons for a user
 */
export async function getUserDisableReasons(userId: string) {
  try {
    const { data, error } = await supabase
      .from('disable_notifications')
      .select('*')
      .eq('user_id', userId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[DISABLE_REASON] Failed to get user disable reasons', {
        userId,
        error: error.message,
      })
      return []
    }

    return data || []
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to get user disable reasons', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * Acknowledge a disable notification (mark as seen)
 */
export async function acknowledgeDisableReason(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('disable_notifications')
      .update({ acknowledged: true })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      logger.error('[DISABLE_REASON] Failed to acknowledge disable reason', {
        userId,
        notificationId,
        error: error.message,
      })
      return false
    }

    logger.info('[DISABLE_REASON] Acknowledged disable reason', {
      userId,
      notificationId,
    })
    return true
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to acknowledge disable reason', {
      userId,
      notificationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Get human-readable explanation for a disable reason
 */
export function getDisableReasonExplanation(
  reason: DisableReason,
  metadata?: DisableReasonMetadata,
): { title: string; description: string; action?: string } {
  switch (reason) {
    case 'TOKEN_REVOKED':
      return {
        title: 'App permissions revoked',
        description:
          "You removed Dotabod's access to your Twitch account. Please reconnect to restore functionality.",
        action: 'Reconnect your Twitch account',
      }

    case 'MANUAL_DISABLE':
      return {
        title: 'Manually disabled',
        description: `Dotabod was disabled by ${metadata?.disabled_by || 'a moderator'} using the ${metadata?.command || '!disable'} command.`,
        action: 'Use !enable command to re-enable',
      }

    case 'STREAM_OFFLINE':
      return {
        title: 'Stream is offline',
        description: 'This feature only works when you are streaming live on Twitch.',
        action: 'Start streaming to re-enable',
      }

    case 'CHAT_PERMISSION_DENIED':
      return {
        title: 'Chat permission denied',
        description:
          metadata?.drop_reason === 'followers_only_mode'
            ? 'Dotabod cannot send messages because your channel is in followers-only mode and the bot is not a moderator.'
            : 'Dotabod lacks the necessary permissions to send chat messages.',
        action: 'Make Dotabod a moderator or disable followers-only mode',
      }

    case 'SUBSCRIPTION_INSUFFICIENT':
      return {
        title: 'Subscription required',
        description: `This feature requires a ${metadata?.required_tier || 'Pro'} subscription. Your current tier is ${metadata?.current_tier || 'Free'}.`,
        action: `Upgrade to ${metadata?.required_tier || 'Pro'}`,
      }

    case 'API_ERROR':
      return {
        title: 'API error occurred',
        description: `Failed to communicate with ${metadata?.api_endpoint || 'external service'}: ${metadata?.error_message || 'Unknown error'}`,
        action: 'Contact support if this persists',
      }

    case 'INVALID_TOKEN':
      return {
        title: 'Authentication expired',
        description: 'Your Twitch authentication has expired and needs to be refreshed.',
        action: 'Refresh your connection in settings',
      }

    case 'BOT_BANNED':
      return {
        title: 'Bot is banned',
        description: 'The Dotabod bot has been banned from your Twitch channel.',
        action: 'Unban the Dotabod bot in your Twitch moderation settings',
      }

    case 'GAME_STATE':
      return {
        title: 'Game state requirement not met',
        description: metadata?.required_game_mode
          ? `This feature only works in ${metadata.required_game_mode} games.`
          : 'This feature is only available during specific game conditions.',
        action: 'Feature will auto-enable when conditions are met',
      }

    case 'RANK_RESTRICTION':
      return {
        title: 'Rank requirement not met',
        description: `This feature is restricted to ${metadata?.minimum_rank || 'higher ranked'} players and above. Your current rank is ${metadata?.user_rank || 'unverified'}.`,
        action: 'Verify your rank at dotabod.com/verify',
      }

    default:
      return {
        title: 'Feature disabled',
        description: 'This feature has been automatically disabled.',
        action: 'Check your settings or contact support',
      }
  }
}
