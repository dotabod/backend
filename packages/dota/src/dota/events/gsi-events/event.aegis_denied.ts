import { logger } from '@dotabod/shared-utils'
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

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    let playerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
    if (playerIdIndex === -1) {
      playerIdIndex = event.player_id
    }
    // Same gating as event.aegis_picked_up: sub-8500 may use the player-slot
    // color, 8500+ only names a real resolved hero. event.player_id is not a
    // dependable slot/color index (Dota reshuffles it in some games).
    const heroid = matchPlayers[playerIdIndex]?.heroid
    const high = is8500Plus(dotaClient.client)
    const heroName = heroid || !high ? getHeroNameOrColor(heroid ?? 0, playerIdIndex) : null

    logger.info('[AEGIS] denied attribution', {
      token: dotaClient.getToken(),
      matchId: dotaClient.client.gsi?.map?.matchid,
      player_id: event.player_id,
      resolvedIndex: playerIdIndex,
      is8500Plus: high,
      rosterSize: matchPlayers.length,
      roster: matchPlayers.map((p) => ({ playerid: p.playerid, heroid: p.heroid })),
      heroName,
    })

    say(
      dotaClient.client,
      heroName
        ? t('aegis.denied', { lng: dotaClient.client.locale, heroName, emote: 'ICANT' })
        : t('aegis.deniedUnknown', { lng: dotaClient.client.locale, emote: 'ICANT' }),
      { chattersKey: 'roshDeny' },
    )
  },
})
