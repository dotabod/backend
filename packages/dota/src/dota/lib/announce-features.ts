import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { redisClient } from '../../db/redis-instance'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import eventHandler from '../events/event-handler'
import type { GSIHandlerType } from '../gsi-handler-types'
import { say } from '../say'
import { FEATURE_ANNOUNCEMENTS } from './feature-announcements'
import type { FeatureAnnouncement } from './feature-announcements'
import { isPlayingMatch } from './is-playing-match'

const WHATS_NEW_URL = 'dotabod.com/dashboard/whats-new'

// Per-process cache of (token, featureId) pairs we've already handled, so the GSI trigger
// path doesn't re-hit Postgres every match once a streamer has seen a feature (cf. the
// BoundedSet in setupSignals.ts). Bounded so long uptimes can't grow it unboundedly.
const CACHE_MAX = 10_000
const handledCache = new Set<string>()
const markHandled = function markHandled(key: string) {
  if (handledCache.size >= CACHE_MAX) {
    const oldest = handledCache.values().next().value
    if (oldest !== undefined) {
      handledCache.delete(oldest)
    }
  }
  handledCache.add(key)
}

// A "new feature" is on when its explicit per-feature toggle is set; otherwise it follows the
// autoOptInNewFeatures master (default on). Mirrors hero.id.ts's cosmetics gate.
export const isFeatureEnabled = function isFeatureEnabled(
  client: SocketClient,
  gateSettingKey?: FeatureAnnouncement['gateSettingKey']
): boolean {
  const master = getValueOrDefault(
    DBSettings.autoOptInNewFeatures,
    client.settings,
    client.subscription
  ) as boolean
  if (!gateSettingKey) {
    return master
  }
  const perFeature = getValueOrDefault(gateSettingKey, client.settings, client.subscription) as
    | boolean
    | null
  return perFeature ?? master
}

// Announce a single feature to a streamer at most once ever — durable (Postgres flag, survives
// Redis loss) and race-free via ON CONFLICT DO NOTHING + .select() (only the first insert
// returns a row). Returns true only when it actually announced. Also drops a NEW_FEATURE
// dashboard notification (the bell) alongside the chat message.
const announceFeatureOnce = async function announceFeatureOnce(
  client: SocketClient,
  feature: FeatureAnnouncement
): Promise<boolean> {
  const cacheKey = `${client.token}:${feature.id}`
  if (handledCache.has(cacheKey)) {
    return false
  }
  if (!isFeatureEnabled(client, feature.gateSettingKey)) {
    return false
    // may enable later; don't cache
  }

  const { data, error } = await supabase
    .from('settings')
    .upsert(
      {
        key: `featureAnnounced:${feature.id}`,
        updated_at: new Date().toISOString(),
        userId: client.token,
        value: true,
      },
      { ignoreDuplicates: true, onConflict: 'userId, key' }
    )
    .select('key')

  // A transient write error: don't cache or claim it — allow a retry on the next trigger
  // (otherwise the in-memory cache would block this streamer until the process restarts).
  if (error) {
    logger.error('[feature-announce] settings flag upsert failed', { error, id: feature.id })
    return false
  }
  // Recorded now (first time) or already recorded earlier — never look again.
  markHandled(cacheKey)
  if (!data?.length) {
    return false
    // already announced ever
  }

  const { error: notifyError } = await supabase
    .from('notifications')
    .insert({ isRead: false, type: 'NEW_FEATURE', userId: client.token })
  if (notifyError) {
    logger.error('[feature-announce] failed to create dashboard notification', {
      error: notifyError,
      id: feature.id,
    })
  }

  say(client, t(feature.messageKey, { lng: client.locale, url: WHATS_NEW_URL }))
  return true
}

// On a trigger event, announce at most ONE pending feature for this match — so a streamer with
// several un-seen features (e.g. after a backfill) gets them spread over matches, not in a
// burst. The per-match guard is a self-correcting Redis key (new matchid → eligible again).
export const dispatchFeatureAnnouncements = async function dispatchFeatureAnnouncements(
  dotaClient: GSIHandlerType,
  trigger: string,
  data: unknown
): Promise<void> {
  const { client } = dotaClient
  // EventHandler already gates events on stream_online; this explicit guard keeps the
  // dispatcher correct if ever called from another path, and never persists a
  // featureAnnounced flag (which would suppress the notice forever) for an offline streamer.
  if (!client.stream_online) {
    return
  }
  if (!isPlayingMatch(client.gsi)) {
    return
  }

  const matchId = client.gsi?.map?.matchid
  if (matchId === undefined || matchId.length === 0) {
    return
  }

  const guardKey = `${client.token}:featureAnnouncedMatch`
  if ((await redisClient.client.get(guardKey)) === matchId) {
    return
  }

  for (const feature of FEATURE_ANNOUNCEMENTS) {
    if (feature.trigger !== trigger) {
      continue
    }
    if (feature.when && !feature.when(dotaClient, data)) {
      continue
    }
    if (await announceFeatureOnce(client, feature)) {
      await redisClient.client.set(guardKey, matchId)
      return
    }
  }
}

// Register one listener per distinct trigger via the EventHandler wrapper (which fans out to
// multiple listeners per event), so these coexist with the existing per-event handlers.
export const registerFeatureAnnouncers = function registerFeatureAnnouncers(): void {
  const triggers = [...new Set(FEATURE_ANNOUNCEMENTS.map((f) => f.trigger))]
  for (const trigger of triggers) {
    eventHandler.registerEvent(trigger, {
      handler: async (dotaClient, data) => {
        await dispatchFeatureAnnouncements(dotaClient, trigger, data)
      },
    })
  }
}
