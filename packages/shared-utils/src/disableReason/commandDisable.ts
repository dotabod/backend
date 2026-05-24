import { recordDisableNotification, trackDisableReason, trackResolveReason } from './service'
import type { DisableReason, DisableReasonMetadata } from './types'

/**
 * Setting-specific facade for `commandDisable`, which has INVERTED semantics
 * (`value: true` means commands are disabled). Encodes the inversion in one
 * place so callers can't misremember which boolean to write.
 *
 * Use these in preference to calling `trackDisableReason` /
 * `trackResolveReason` with `commandDisable` directly.
 */
export const commandDisable = {
  /** Disable the bot for this user. Single settings write + one audit row. */
  disable(userId: string, reason: DisableReason, metadata?: DisableReasonMetadata): Promise<void> {
    return trackDisableReason(userId, 'commandDisable', reason, metadata, { disabledValue: true })
  },

  /**
   * Re-enable the bot. Single settings write that both clears the disable_*
   * metadata and flips `value` back to `false`.
   *
   * `opts.reason`: only resolve audit rows matching that reason (e.g.
   * `!clearsharing` should only resolve ACCOUNT_SHARING rows).
   * `opts.autoResolved`: marks the audit resolve as automated rather than
   * user-initiated.
   */
  enable(
    userId: string,
    opts: { reason?: DisableReason; autoResolved?: boolean } = {},
  ): Promise<void> {
    return trackResolveReason(userId, 'commandDisable', opts.autoResolved ?? false, {
      reason: opts.reason,
      enabledValue: false,
    })
  },

  /**
   * Insert an audit-only notification without touching the settings row. Use
   * when something flagged the bot but we explicitly don't want to disable it
   * (e.g. ACCOUNT_SHARING is blocked at runtime in Redis, not via the setting).
   */
  recordNotification(
    userId: string,
    reason: DisableReason,
    metadata?: DisableReasonMetadata,
  ): Promise<void> {
    return recordDisableNotification(userId, 'commandDisable', reason, metadata)
  },
}
