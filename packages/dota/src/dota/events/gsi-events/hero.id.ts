import { t } from 'i18next'

import { redisClient } from '../../../db/redisInstance'
import { DBSettings, getValueOrDefault } from '../../../settings'
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

    // Always snapshot the loadout to the DB, online or not.
    const items = await captureCosmetics(dotaClient.client)

    const client = dotaClient.client
    // Only announce while live, and only when we actually captured something
    // (a hero with just base parts resolves to no items).
    if (!client.stream_online) return
    if (!items.length) return

    // Cosmetic-set announcements are a "new feature": an explicit per-feature
    // choice always wins; otherwise the streamer's autoOptInNewFeatures master
    // toggle decides the default (on). cosmeticsAnnounce is null until the
    // streamer explicitly flips it.
    const perFeature = getValueOrDefault(
      DBSettings.cosmeticsAnnounce,
      client.settings,
      client.subscription,
    ) as boolean | null
    const autoOptIn = getValueOrDefault(
      DBSettings.autoOptInNewFeatures,
      client.settings,
      client.subscription,
    ) as boolean
    if ((perFeature ?? autoOptIn) !== true) return

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
