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
// long-tail safety net for any delivery gap (replica lag, deploy window).
//
// REPLICA IDENTITY: the UPDATE/DELETE handlers below read fields off `old`
// (e.g. `old.provider`, `old.requires_refresh`, `old.name`, `old.displayName`).
// Supabase Realtime only ships those non-PK columns in `old` when the source
// table has `REPLICA IDENTITY FULL`. The dota watcher relies on the same
// behavior for `accounts.requires_refresh`, so this requirement is already
// satisfied for `accounts` in production. The `users` table also requires
// REPLICA IDENTITY FULL for the rename guard at line ~97 to work correctly.

const IS_DEV = process.env.DOTABOD_ENV !== 'production'

// supabase-js v2 channels do NOT auto-resubscribe after CHANNEL_ERROR /
// CLOSED / TIMED_OUT — the callback fires once and the channel is dead.
// Without explicit reconnect, a single network blip can leave the watcher
// blind to INSERT/UPDATE/DELETE events until the process restarts. Constant
// 5s backoff; outages of >5s are uncommon and the 5-min reconciliation in
// subscriptionHealthCheck.ts is the long-tail safety net.
const RECONNECT_DELAY_MS = 5000

export function setupAccountWatcher(): void {
  const channelName = `${IS_DEV ? 'dev-' : ''}twitch-events`
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let activeChannel: unknown = null

  const scheduleReconnect = (status: string, err?: Error) => {
    // Don't pile up reconnect timers if the dead channel's callback fires
    // multiple times for the same outage.
    if (reconnectTimer) return
    // Claim the guard and detach the dead channel BEFORE touching
    // removeChannel(). supabase-js tears the channel down synchronously and
    // re-fires THIS status callback with CLOSED on the same stack — which
    // re-enters scheduleReconnect. If reconnectTimer / activeChannel were
    // still unset at that point, the re-entrant call sails past the guard,
    // calls removeChannel again, re-fires CLOSED again, and recurses until the
    // stack overflows and the process crashes. (Prod 2026-06-21: one Realtime
    // blip → ~390-deep recursion → RangeError thrown inside the winston
    // console transport → twitch-events restart, taking the conduit down and
    // cascading xhr/conduit-timeout errors into twitch-chat.) Setting state
    // first makes the re-entrant call hit `if (reconnectTimer) return`.
    reconnectTimer = setTimeout(subscribe, RECONNECT_DELAY_MS)
    const deadChannel = activeChannel
    activeChannel = null
    logger.warn('[WATCHER] Realtime channel down, scheduling reconnect', {
      status,
      err: err?.message,
      delayMs: RECONNECT_DELAY_MS,
    })
    if (deadChannel) {
      // Tear down the dead channel before re-creating it. supabase-js
      // doesn't auto-clean closed channels and they can leak. removeChannel
      // returns a promise but we don't block reconnect on it.
      void supabase.removeChannel(deadChannel as Parameters<typeof supabase.removeChannel>[0])
    }
  }

  const subscribe = () => {
    reconnectTimer = null
    // Supabase Realtime's `.on('postgres_changes')` overloads require
    // RealtimePostgresChangesPayload-typed callbacks; typing each handler
    // properly cascades into a wall of generics. Same loose-typing escape
    // hatch as `packages/dota/src/db/watcher.ts:21`.
    let channel: any
    try {
      channel = supabase.channel(channelName)
      activeChannel = channel
    } catch (err) {
      // supabase.channel() can throw synchronously if the Realtime client is
      // in a bad state. Without this guard, the throw propagates up and the
      // watcher silently dies — defeating the whole point of the reconnect
      // logic. Treat it as a CHANNEL_ERROR and schedule another attempt.
      logger.error('[WATCHER] supabase.channel() threw — scheduling reconnect', {
        channelName,
        err: err instanceof Error ? err.message : String(err),
      })
      activeChannel = null
      scheduleReconnect('CHANNEL_CREATION_THREW', err instanceof Error ? err : undefined)
      return
    }

    logger.info('[WATCHER] Starting accounts/users watcher', { channelName })

    try {
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

            // Live ban: banned_at transitioned null → set. Tear down EventSub
            // subs so no further channel.chat.message / stream.online / etc
            // events flow. The frontend jwt() callback and backend getDBUser
            // gates already block re-auth / GSI POSTs; this branch handles
            // the side that the gates can't reach (Twitch already accepted
            // our sub and is streaming events to our conduit).
            if (!oldUser.banned_at && newUser.banned_at) {
              const { data: account, error: accountError } = await supabase
                .from('accounts')
                .select('providerAccountId')
                .eq('userId', newUser.id)
                .eq('provider', 'twitch')
                .single()
              if (accountError) {
                logger.error('[WATCHER] ban: provider lookup failed', {
                  userId: newUser.id,
                  error: accountError,
                })
                return
              }
              if (!account?.providerAccountId) {
                logger.warn('[WATCHER] ban: no twitch account row for user', {
                  userId: newUser.id,
                })
                return
              }
              logger.info('[WATCHER] User banned, stopping subscriptions', {
                userId: newUser.id,
                providerAccountId: account.providerAccountId,
              })
              try {
                await stopUserSubscriptions(account.providerAccountId)
              } catch (error) {
                logger.error('[WATCHER] ban: stopUserSubscriptions failed', {
                  userId: newUser.id,
                  providerAccountId: account.providerAccountId,
                  error,
                })
              }
              return
            }

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
              // Rename-only path: refresh displayName/name via the Twitch API
              // (inside handleNewUser) without re-running EventSub registration.
              // The previous `!oldUser.displayName` resubscribe trigger only
              // existed to compensate for the frontend writing `displayName=NULL`
              // on initial signup — that's fixed by the
              // TwitchProvider.profile() override in frontend/src/lib/auth.ts.
              // Initial subscription is the INSERT:accounts handler's job.
              if (!oldUser.displayName) {
                // Observability: log if we still see legacy NULL displayName rows
                // in production after the frontend fix has been deployed. If this
                // doesn't fire for ~1 week post-deploy the warn can be removed.
                logger.warn(
                  '[WATCHER] UPDATE users with legacy empty displayName (frontend not deployed?)',
                  { userId: newUser.id },
                )
              }
              await handleNewUser(account.providerAccountId, false)
            } catch (error) {
              logger.error('[WATCHER] UPDATE users handleNewUser failed', {
                providerAccountId: account.providerAccountId,
                error,
              })
            }
          },
        )
        .subscribe((status: string, err?: Error) => {
          if (status === 'SUBSCRIBED') {
            logger.info('[WATCHER] Subscribed to Realtime channel', { channelName })
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
            scheduleReconnect(status, err)
          }
        })
    } catch (err) {
      // If `.on(...)` or `.subscribe(...)` throws synchronously, the chain
      // breaks before the status callback can attach. Without this guard the
      // channel sits in memory with no listener — reconnect would never fire.
      logger.error('[WATCHER] channel.on/.subscribe threw — scheduling reconnect', {
        channelName,
        err: err instanceof Error ? err.message : String(err),
      })
      scheduleReconnect('CHANNEL_SETUP_THREW', err instanceof Error ? err : undefined)
    }
  }

  subscribe()
}
