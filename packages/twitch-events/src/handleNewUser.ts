import { logger, supabase } from '@dotabod/shared-utils'
import { initUserSubscriptions } from './initUserSubscriptions'
import { getBotInstance } from './twitch/lib/BotApiSingleton'

const botApi = getBotInstance()

// Single retry to cover the Supabase Realtime → read-replica race. 1s is
// generous; replica lag is typically <100ms in production.
export const REPLICA_LAG_RETRY_MS = 1000

/**
 * Look up the `userId` for a given Twitch providerAccountId. Retries once on
 * a null result to mitigate the Supabase Realtime → read-replica race where
 * the INSERT event lands before the row is visible to subsequent SELECTs.
 *
 * Throws on a persistent DB error rather than returning null, so callers can
 * distinguish "row genuinely missing" from "lookup failed transiently" — the
 * old swallow-error behavior logged a misleading "no accounts row" warning
 * for transient postgrest/network failures.
 */
async function findUserIdByProviderAccount(providerAccountId: string): Promise<string | null> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('accounts')
      .select('userId')
      .eq('providerAccountId', providerAccountId)
      .eq('provider', 'twitch')
      .single()
    if (data?.userId) return data.userId
    lastError = error ?? null
    if (attempt === 0) await new Promise((r) => setTimeout(r, REPLICA_LAG_RETRY_MS))
  }
  if (lastError) throw lastError
  return null
}

export async function handleNewUser(
  providerAccountId: string,
  resubscribeEvents = true,
): Promise<void> {
  logger.info("[TWITCHEVENTS] New user, let's get their info", { providerAccountId })

  if (!providerAccountId) {
    logger.warn('[TWITCHEVENTS] handleNewUser called without providerAccountId')
    return
  }

  // Ban gate runs before any Twitch API hit. If the userId lookup fails
  // transiently (errors), the inner try lets it propagate to the outer
  // catch — same "profile update failed" path the old code used. A null
  // result (row genuinely missing) falls through to the existing warn.
  let banShortCircuit = false

  // Step 1: pull stream + display info from Twitch and reflect it on the
  // users row. If Twitch is flaky we log + continue to Step 2 — the prior
  // throw-from-catch caused the resubscribe step to be skipped entirely,
  // leaving a user with no EventSub subs during a transient /helix outage.
  let profileUpdated = false
  try {
    const userId = await findUserIdByProviderAccount(providerAccountId)

    if (userId) {
      const { data: banRow, error: banError } = await supabase
        .from('users')
        .select('banned_at')
        .eq('id', userId)
        .single()
      if (banError) {
        // Transient DB error — log but keep going. The watcher's UPDATE:users
        // ban branch is the live-ban path; this lookup is a steady-state guard.
        logger.error('[TWITCHEVENTS] handleNewUser: ban check failed', {
          providerAccountId,
          userId,
          error: banError,
        })
      } else if (banRow?.banned_at) {
        logger.info('[TWITCHEVENTS] handleNewUser: skipping banned user', {
          providerAccountId,
          userId,
        })
        banShortCircuit = true
      }
    }

    if (banShortCircuit) {
      // Skip Twitch profile fetch + users update + subscription registration.
      // Fall through to the bottom of the function (return).
    } else {
      const stream = await botApi.streams.getStreamByUserId(providerAccountId)
      const streamer = await botApi.users.getUserById(providerAccountId)

      const data = {
        displayName: streamer?.displayName,
        name: streamer?.name,
        stream_online: !!stream?.startDate,
        stream_start_date: stream?.startDate.toISOString() ?? null,
      }
      const filteredData = Object.fromEntries(
        Object.entries(data).filter(([_key, value]) => Boolean(value)),
      )

      if (userId) {
        await supabase
          .from('users')
          .update(filteredData as typeof data)
          .eq('id', userId)
        profileUpdated = true
      } else {
        // Both attempts returned null. Either the caller has a bogus
        // providerAccountId (e.g. INSERT race for a row that was deleted
        // before replication finished) OR replica lag is >REPLICA_LAG_RETRY_MS.
        // Surface at error level so the alert pipeline catches it — repeated
        // misses here mean missing subscriptions that the 5-min healthcheck
        // would have to reconcile.
        logger.error('[TWITCHEVENTS] handleNewUser: no accounts row after retry', {
          providerAccountId,
        })
      }
    }
  } catch (error) {
    // Surface at error level so observability picks up Twitch API / DB
    // outages, but do NOT throw — Step 2 (subscription registration) should
    // still run so the user is at least subscribed to events.
    logger.error('[TWITCHEVENTS] handleNewUser: profile update failed', {
      providerAccountId,
      error,
    })
  }

  // Suppress unused-variable lint while keeping the flag for future call
  // sites that may want to differentiate "subscribed but profile stale".
  void profileUpdated

  if (banShortCircuit) return

  if (resubscribeEvents) {
    // initUserSubscriptions returns false (not throws) when a critical sub
    // can't be registered; translate that into a thrown error so awaited
    // callers (watcher) surface the failure for the next healthcheck cycle
    // to reconcile.
    const ok = await initUserSubscriptions(providerAccountId)
    if (ok === false) {
      throw new Error(
        `[TWITCHEVENTS] initUserSubscriptions: critical subscription failed for ${providerAccountId}`,
      )
    }
  }
}
