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
  metadata?: DisableReasonMetadata
): Promise<void> {
  try {
    await supabase.from('disable_notifications').insert({
      created_at: new Date().toISOString(),
      metadata: metadata || {},
      reason,
      setting_key: settingKey,
      user_id: userId,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to record disable notification', {
      error: error instanceof Error ? error.message : String(error),
      reason,
      settingKey,
      userId,
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
  opts: { reason?: DisableReason; autoResolved?: boolean } = {}
): Promise<void> {
  const { reason, autoResolved = false } = opts
  try {
    let query = supabase
      .from('disable_notifications')
      .update({
        auto_resolved: autoResolved,
        resolved_at: new Date().toISOString(),
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
      error: error instanceof Error ? error.message : String(error),
      reason,
      settingKey,
      userId,
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
  opts: { disabledValue?: boolean } = {}
): Promise<void> {
  const { disabledValue = false } = opts
  try {
    const now = new Date()

    await supabase.from('settings').upsert(
      {
        auto_disabled_at: now.toISOString(),
        auto_disabled_by: 'system',
        disable_metadata: metadata || {},
        disable_reason: reason,
        key: settingKey,
        updated_at: now.toISOString(),
        userId,
        value: disabledValue,
      },
      {
        onConflict: 'userId, key',
      }
    )

    await recordDisableNotification(userId, settingKey, reason, metadata)

    logger.info('[DISABLE_REASON] Tracked disable reason', {
      metadata,
      reason,
      settingKey,
      userId,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to track disable reason', {
      error: error instanceof Error ? error.message : String(error),
      reason,
      settingKey,
      userId,
    })
  }
}

/**
 * Clear the disable-tracking fields on a `settings` row and mark its open
 * `disable_notifications` rows resolved.
 *
 * - `opts.reason`: only resolve notifications matching that reason (e.g.
 *   `!clearsharing` should only resolve `ACCOUNT_SHARING` rows, not unrelated
 *   `CHAT_PERMISSION_DENIED` ones).
 * - `opts.enabledValue`: if provided, also write this as the settings `value`
 *   in the same UPDATE. Use this when the resolve also flips the feature back
 *   on, so the realtime watcher only sees ONE settings change (otherwise a
 *   second `settings.upsert` by the caller fires it again).
 */
export async function trackResolveReason(
  userId: string,
  settingKey: string,
  autoResolved = false,
  opts: { reason?: DisableReason; enabledValue?: boolean } = {}
): Promise<void> {
  try {
    const now = new Date()

    await supabase
      .from('settings')
      .update({
        auto_disabled_at: null,
        auto_disabled_by: null,
        disable_metadata: null,
        disable_reason: null,
        updated_at: now.toISOString(),
        ...(opts.enabledValue === undefined ? {} : { value: opts.enabledValue }),
      })
      .eq('userId', userId)
      .eq('key', settingKey)

    await resolveDisableNotifications(userId, settingKey, {
      autoResolved,
      reason: opts.reason,
    })

    logger.info('[DISABLE_REASON] Resolved disable reason', {
      autoResolved,
      reason: opts.reason,
      settingKey,
      userId,
    })
  } catch (error) {
    logger.error('[DISABLE_REASON] Failed to resolve disable reason', {
      error: error instanceof Error ? error.message : String(error),
      settingKey,
      userId,
    })
  }
}
