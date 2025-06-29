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
