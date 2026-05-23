import { t } from 'i18next'

import { type AegisDeniedEvent, DotaEventTypes } from '../../../types'
import { is8500Plus } from '../../../utils/index'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { say } from '../../say'
import eventHandler from '../EventHandler'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisDenied}`, {
  handler: async (dotaClient, event: AegisDeniedEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const { matchPlayers } = await getAccountsFromMatch({
      gsi: dotaClient.client.gsi,
    })

    const foundIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
    const playerIdIndex = foundIndex === -1 ? event.player_id : foundIndex
    const heroid = matchPlayers[playerIdIndex]?.heroid
    const high = is8500Plus(dotaClient.client)
    // Same gating as event.aegis_picked_up: 8500+ only names a hero when we
    // positively matched the player by `playerid` in the roster — indexing by
    // raw event.player_id is unreliable in reshuffled high-immortal games.
    const heroName = high
      ? foundIndex !== -1 && heroid
        ? getHeroNameOrColor(heroid, playerIdIndex)
        : null
      : getHeroNameOrColor(heroid ?? 0, playerIdIndex)

    say(
      dotaClient.client,
      heroName
        ? t('aegis.denied', {
            lng: dotaClient.client.locale,
            heroName,
            emote: 'ICANT',
          })
        : t('aegis.deniedUnknown', {
            lng: dotaClient.client.locale,
            emote: 'ICANT',
          }),
      { chattersKey: 'roshDeny' },
    )
  },
})
