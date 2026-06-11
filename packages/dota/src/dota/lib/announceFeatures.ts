import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { redisClient } from '../../db/redisInstance'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import eventHandler from '../events/EventHandler'
import type { GSIHandlerType } from '../GSIHandlerTypes'
import { say } from '../say'
import { type FeatureAnnouncement, FEATURE_ANNOUNCEMENTS } from './featureAnnouncements'
import { isPlayingMatch } from './isPlayingMatch'

const WHATS_NEW_URL = 'dotabod.com/dashboard/whats-new'

// Per-process cache of (token, featureId) pairs we've already handled, so the GSI trigger
// path doesn't re-hit Postgres every match once a streamer has seen a feature (cf. the
// BoundedSet in setupSignals.ts). Bounded so long uptimes can't grow it unboundedly.
const CACHE_MAX = 10_000
const handledCache = new Set<string>()
function markHandled(key: string) {
  if (handledCache.size >= CACHE_MAX) {
    const oldest = handledCache.values().next().value
    if (oldest !== undefined) handledCache.delete(oldest)
  }
  handledCache.add(key)
}

// A "new feature" is on when its explicit per-feature toggle is set; otherwise it follows the
// autoOptInNewFeatures master (default on). Mirrors hero.id.ts's cosmetics gate.
export function isFeatureEnabled(
  client: SocketClient,
  gateSettingKey?: FeatureAnnouncement['gateSettingKey'],
): boolean {
  const master = getValueOrDefault(
    DBSettings.autoOptInNewFeatures,
    client.settings,
    client.subscription,
  ) as boolean
  if (!gateSettingKey) return master === true
  const perFeature = getValueOrDefault(gateSettingKey, client.settings, client.subscription) as
    | boolean
    | null
  return (perFeature ?? master) === true
}

// Announce a single feature to a streamer at most once ever — durable (Postgres flag, survives
// Redis loss) and race-free via ON CONFLICT DO NOTHING + .select() (only the first insert
// returns a row). Returns true only when it actually announced. Also drops a NEW_FEATURE
// dashboard notification (the bell) alongside the chat message.
async function announceFeatureOnce(
  client: SocketClient,
  feature: FeatureAnnouncement,
): Promise<boolean> {
  const cacheKey = `${client.token}:${feature.id}`
  if (handledCache.has(cacheKey)) return false
  if (!isFeatureEnabled(client, feature.gateSettingKey)) return false // may enable later; don't cache

  const { data, error } = await supabase
    .from('settings')
    .upsert(
      {
        userId: client.token,
        key: `featureAnnounced:${feature.id}`,
        value: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'userId, key', ignoreDuplicates: true },
    )
    .select('key')

  // A transient write error: don't cache or claim it — allow a retry on the next trigger
  // (otherwise the in-memory cache would block this streamer until the process restarts).
  if (error) {
    logger.error('[feature-announce] settings flag upsert failed', { id: feature.id, error })
    return false
  }
  // Recorded now (first time) or already recorded earlier — never look again.
  markHandled(cacheKey)
  if (!data?.length) return false // already announced ever

  const { error: notifyError } = await supabase
    .from('notifications')
    .insert({ userId: client.token, type: 'NEW_FEATURE', isRead: false })
  if (notifyError) {
    logger.error('[feature-announce] failed to create dashboard notification', {
      id: feature.id,
      error: notifyError,
    })
  }

  say(client, t(feature.messageKey, { url: WHATS_NEW_URL, lng: client.locale }))
  return true
}

// On a trigger event, announce at most ONE pending feature for this match — so a streamer with
// several un-seen features (e.g. after a backfill) gets them spread over matches, not in a
// burst. The per-match guard is a self-correcting Redis key (new matchid → eligible again).
export async function dispatchFeatureAnnouncements(
  dotaClient: GSIHandlerType,
  trigger: string,
  data: unknown,
): Promise<void> {
  const client = dotaClient.client
  if (!isPlayingMatch(client.gsi)) return

  const matchId = client.gsi?.map?.matchid
  if (!matchId) return

  const guardKey = `${client.token}:featureAnnouncedMatch`
  if ((await redisClient.client.get(guardKey)) === String(matchId)) return

  for (const feature of FEATURE_ANNOUNCEMENTS) {
    if (feature.trigger !== trigger) continue
    if (feature.when && !feature.when(dotaClient, data)) continue
    if (await announceFeatureOnce(client, feature)) {
      await redisClient.client.set(guardKey, String(matchId))
      return
    }
  }
}

// Register one listener per distinct trigger via the EventHandler wrapper (which fans out to
// multiple listeners per event), so these coexist with the existing per-event handlers.
export function registerFeatureAnnouncers(): void {
  const triggers = [...new Set(FEATURE_ANNOUNCEMENTS.map((f) => f.trigger))]
  for (const trigger of triggers) {
    eventHandler.registerEvent(trigger, {
      handler: (dotaClient, data) => dispatchFeatureAnnouncements(dotaClient, trigger, data),
    })
  }
}
