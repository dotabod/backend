import supabase from '../db/supabase'
import { logger } from '../logger'
import type { DisableReason, DisableReasonMetadata } from './types'

export const recordDisableNotification = async function recordDisableNotification(
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

export const resolveDisableNotifications = async function resolveDisableNotifications(
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

export const trackDisableReason = async function trackDisableReason(
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

export const trackResolveReason = async function trackResolveReason(
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
