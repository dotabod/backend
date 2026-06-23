import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { redisClient } from '../../db/redisInstance'
import type { SocketClient } from '../../types'
import { say } from '../say'
import { isFeatureEnabled } from './announceFeatures'
import { captureCosmetics } from './captureCosmetics'
import { heroRevealableStates } from './consts'
import { getHeroNameOrColor } from './heroes'
import { isPlayingMatch } from './isPlayingMatch'

// Snapshot the played hero's equipped cosmetics and announce the captured set in chat — but
// only once the hero is publicly visible (strategy phase onward, see heroRevealableStates).
// Announcing during hero selection / draft would name the streamer's pick in chat and hand it
// to stream snipers, exactly the reveal the picks blocker hides until everyone's locked in.
//
// Safe to call from several GSI triggers (hero:id on a pick/swap, map:game_state at strategy
// time): a per-match+hero Redis stamp dedups, so only one line ever posts. A pick fires hero:id
// during hero selection (held here), and the strategy-time map:game_state transition is what
// actually releases the announcement; mid-game swaps are already past strategy and post at once.
export async function announceCapturedCosmetics(client: SocketClient): Promise<void> {
  try {
    // EventHandler already gates events on stream_online; re-checked so any future caller stays
    // correct and we never announce while offline.
    if (!client.stream_online) return
    if (!isPlayingMatch(client.gsi)) return

    // Hold the reveal until the same "all heroes locked in for everyone" window the picks
    // blocker uses. During hero selection / draft this returns and the strategy-time trigger
    // takes over, so the pick is never tipped to snipers.
    if (!heroRevealableStates.includes(client.gsi?.map?.game_state ?? '')) return

    const heroId = client.gsi?.hero?.id
    if (!heroId || heroId <= 0) return

    // Snapshot the loadout regardless of the chat toggle so dotabod.com/<name>/set fills in
    // even for streamers who opted out of the announcement. No-ops without real wearables.
    const items = await captureCosmetics(client)
    if (!items.length) return

    // The chat line is the opt-out-able "new feature": an explicit per-feature choice wins,
    // else the autoOptInNewFeatures master decides. Shared with the feature announcer.
    if (!isFeatureEnabled(client, 'cosmeticsAnnounce')) return

    // Announce at most once per match+hero. The stamp self-corrects across matches (new
    // matchid) and hero swaps (new heroId), and dedups the pick vs. strategy-time triggers.
    const { token, name, locale } = client
    const matchId = client.gsi?.map?.matchid
    const announcedKey = `${token}:cosmeticsAnnounced`
    const stamp = `${matchId}:${heroId}`
    if ((await redisClient.client.get(announcedKey)) === stamp) return
    await redisClient.client.set(announcedKey, stamp)

    say(
      client,
      t('cosmetics.captured', {
        heroName: getHeroNameOrColor(heroId),
        count: items.length,
        url: `dotabod.com/${name}/set`,
        lng: locale,
      }),
    )
  } catch (err) {
    // Never let a cosmetics hiccup bubble into the callers (e.g. the clip scheduler shares the
    // map:game_state handler) — log and move on.
    logger.error('[cosmetics] failed to announce captured set', { token: client?.token, err })
  }
}
