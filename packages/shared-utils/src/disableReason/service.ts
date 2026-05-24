import supabase from '../db/supabase'
import { logger } from '../logger'
import type { DisableReason, DisableReasonMetadata } from './types'

/**
 * Insert an audit row into `disable_notifications` without touching the
 * `settings` row. Use this when you want to record that something went wrong
 * (e.g. account-sharing detected) without changing the user's feature state.
 */
export async function recordDisableNotification(
  userId: string,
  settingKey: string,
  reason: DisableReason,
  metadata?: DisableReasonMetadata,
): Promise<void> {
  try {
    await supabase.from('disable_notifications').insert({
      user_id: userId,
      setting_key: settingKey,
      reason,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to record disable notification', {
      userId,
      settingKey,
      reason,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Mark open `disable_notifications` rows as resolved without touching the
 * `settings` row. Optionally narrow to a single `reason` so other open
 * notifications for the same setting aren't falsely resolved.
 */
export async function resolveDisableNotifications(
  userId: string,
  settingKey: string,
  opts: { reason?: DisableReason; autoResolved?: boolean } = {},
): Promise<void> {
  const { reason, autoResolved = false } = opts
  try {
    let query = supabase
      .from('disable_notifications')
      .update({
        resolved_at: new Date().toISOString(),
        auto_resolved: autoResolved,
      })
      .eq('user_id', userId)
      .eq('setting_key', settingKey)
      .is('resolved_at', null)

    if (reason) {
      query = query.eq('reason', reason)
    }

    await query
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to resolve disable notifications', {
      userId,
      settingKey,
      reason,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Track when a setting is disabled and why. Mutates both `settings` (sets
 * `value` to `opts.disabledValue` — default `false`) and `disable_notifications`.
 *
 * For settings with inverted semantics (e.g. `commandDisable`, where `value: true`
 * means disabled), pass `opts: { disabledValue: true }`.
 */
export async function trackDisableReason(
  userId: string,
  settingKey: string,
  reason: DisableReason,
  metadata?: DisableReasonMetadata,
  opts: { disabledValue?: boolean } = {},
): Promise<void> {
  const { disabledValue = false } = opts
  try {
    const now = new Date()

    await supabase.from('settings').upsert(
      {
        userId,
        key: settingKey,
        value: disabledValue,
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

    await recordDisableNotification(userId, settingKey, reason, metadata)

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
 * Clear the disable-tracking fields on a `settings` row and mark its open
 * `disable_notifications` rows resolved. Does not change the setting's `value`.
 *
 * Pass `opts.reason` to only resolve notifications matching that reason (e.g.
 * `!clearsharing` should only resolve `ACCOUNT_SHARING` rows, not unrelated
 * `CHAT_PERMISSION_DENIED` ones).
 */
export async function trackResolveReason(
  userId: string,
  settingKey: string,
  autoResolved = false,
  opts: { reason?: DisableReason } = {},
): Promise<void> {
  try {
    const now = new Date()

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

    await resolveDisableNotifications(userId, settingKey, {
      reason: opts.reason,
      autoResolved,
    })

    logger.info('[DISABLE_REASON] Resolved disable reason', {
      userId,
      settingKey,
      autoResolved,
      reason: opts.reason,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to resolve disable reason', {
      userId,
      settingKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
