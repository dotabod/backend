import { botStatus, logger, supabase, type Tables } from '@dotabod/shared-utils'
import { handleNewUser } from './handleNewUser'
import { stopUserSubscriptions } from './twitch/lib/revokeEvent'

// Mirrors the Supabase Realtime watcher pattern proven in
// packages/dota/src/db/watcher.ts. Replaces the legacy HTTP webhook receiver
// that lived in utils/webhookUtils.ts — one delivery mechanism (Realtime) for
// account/user changes across the whole backend.
//
// All handlers `await` their work and let failures propagate up to Realtime's
// catch-all. The 5-min reconciliation in subscriptionHealthCheck is the
// safety net for any delivery gap (channel drop, replica lag, deploy window).
//
// REPLICA IDENTITY: the UPDATE/DELETE handlers below read fields off `old`
// (e.g. `old.provider`, `old.requires_refresh`, `old.name`, `old.displayName`).
// Supabase Realtime only ships those non-PK columns in `old` when the source
// table has `REPLICA IDENTITY FULL`. The dota watcher relies on the same
// behavior for `accounts.requires_refresh`, so this requirement is already
// satisfied for `accounts` in production. The `users` table also requires
// REPLICA IDENTITY FULL for the rename guard at line ~97 to work correctly.

const IS_DEV = process.env.DOTABOD_ENV !== 'production'

export function setupAccountWatcher(): void {
  const channelName = `${IS_DEV ? 'dev-' : ''}twitch-events`
  // Supabase Realtime's `.on('postgres_changes')` overloads require
  // RealtimePostgresChangesPayload-typed callbacks; typing each handler
  // properly cascades into a wall of generics. Same loose-typing escape
  // hatch as `packages/dota/src/db/watcher.ts:21`.
  const channel: any = supabase.channel(channelName)

  logger.info('[WATCHER] Starting accounts/users watcher', { channelName })

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'accounts' },
      async (payload: { new: Tables<'accounts'> }) => {
        const newObj = payload.new
        if (newObj.provider !== 'twitch') return
        logger.info('[WATCHER] INSERT accounts → onboarding new user', {
          providerAccountId: newObj.providerAccountId,
        })
        try {
          await handleNewUser(newObj.providerAccountId)
        } catch (error) {
          logger.error('[WATCHER] INSERT handleNewUser failed', {
            providerAccountId: newObj.providerAccountId,
            error,
          })
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'accounts' },
      async (payload: { new: Tables<'accounts'>; old: Tables<'accounts'> }) => {
        const newObj = payload.new
        const oldObj = payload.old
        if (newObj.provider !== 'twitch') return
        // Re-auth: requires_refresh flipped true → false.
        if (oldObj.requires_refresh === true && newObj.requires_refresh === false) {
          if (newObj.providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
            logger.info('[WATCHER] Bot no longer banned, clearing status')
            botStatus.isBanned = false
          }
          logger.info('[WATCHER] Refresh token cleared, re-subscribing events', {
            providerAccountId: newObj.providerAccountId,
          })
          try {
            await handleNewUser(newObj.providerAccountId)
          } catch (error) {
            logger.error('[WATCHER] UPDATE handleNewUser failed', {
              providerAccountId: newObj.providerAccountId,
              error,
            })
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'accounts' },
      async (payload: { old: Tables<'accounts'> }) => {
        const oldObj = payload.old
        if (oldObj.provider !== 'twitch') return
        logger.info('[WATCHER] Account deleted, stopping subscriptions', {
          providerAccountId: oldObj.providerAccountId,
        })
        try {
          await stopUserSubscriptions(oldObj.providerAccountId)
        } catch (error) {
          logger.error('[WATCHER] DELETE stopUserSubscriptions failed', {
            providerAccountId: oldObj.providerAccountId,
            error,
          })
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'users' },
      async (payload: { new: Tables<'users'>; old: Tables<'users'> }) => {
        const newUser = payload.new
        const oldUser = payload.old
        if (oldUser.name === newUser.name && oldUser.displayName === newUser.displayName) {
          return
        }
        logger.info('[WATCHER] User renamed', {
          userId: newUser.id,
          oldName: oldUser.name,
          newName: newUser.name,
          oldDisplayName: oldUser.displayName,
          newDisplayName: newUser.displayName,
        })
        // We have userId from the users table; look up providerAccountId on the
        // accounts side so handleNewUser can call the Twitch API by twitch id.
        const { data: account, error: accountError } = await supabase
          .from('accounts')
          .select('providerAccountId')
          .eq('userId', newUser.id)
          .eq('provider', 'twitch')
          .single()
        if (accountError) {
          // Transient DB error — surface at error level so observability picks
          // it up. The next users UPDATE for this user (or the healthcheck
          // cycle for missing subs) will retry the lookup.
          logger.error('[WATCHER] DB error during user rename lookup', {
            userId: newUser.id,
            error: accountError,
          })
          return
        }
        if (!account?.providerAccountId) {
          logger.warn('[WATCHER] User renamed but no twitch account row found', {
            userId: newUser.id,
          })
          return
        }
        try {
          // Only resubscribe events if oldUser.displayName was falsy (i.e. brand-new user).
          await handleNewUser(account.providerAccountId, !oldUser.displayName)
        } catch (error) {
          logger.error('[WATCHER] UPDATE users handleNewUser failed', {
            providerAccountId: account.providerAccountId,
            error,
          })
        }
      },
    )
    .subscribe((status: string, err?: Error) => {
      logger.info('[WATCHER] Subscription status', { status, err })
    })
}
