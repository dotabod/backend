import { t } from 'i18next'

import { redisClient } from '../../../db/redisInstance'
import { isFeatureEnabled } from '../../lib/announceFeatures'
import { captureCosmetics } from '../../lib/captureCosmetics'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { say } from '../../say'
import eventHandler from '../EventHandler'

// Fires once whenever GSI reports a new hero id (pick or mid-game swap, since
// events only emit on change). We snapshot the equipped cosmetics automatically
// here — no need for chat to run !set — provided wearables are already present
// (captureCosmetics no-ops otherwise), then announce the captured set in chat.
eventHandler.registerEvent('hero:id', {
  handler: async (dotaClient, heroId: number) => {
    if (!heroId || heroId <= 0) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    // Snapshot the loadout on every pick/swap. (This handler only runs while live —
    // EventHandler gates events on stream_online — so capture is effectively live-only.)
    const items = await captureCosmetics(dotaClient.client)

    const client = dotaClient.client
    // Only announce when we actually captured something (a hero with just base parts
    // resolves to no items). The stream_online check is belt-and-suspenders.
    if (!client.stream_online) return
    if (!items.length) return

    // Cosmetic-set announcements are a "new feature": an explicit per-feature choice
    // wins, else the autoOptInNewFeatures master decides. Shared with the announcer.
    if (!isFeatureEnabled(client, 'cosmeticsAnnounce')) return

    // Announce at most once per match+hero. hero:id can re-fire on a GSI
    // reconnect; storing+comparing the stamp is self-correcting across matches
    // (a new matchid or hero swap re-announces), mirroring emitStreamersInMatch.
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
  },
})
