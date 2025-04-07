import { t } from 'i18next'

import { type DotaEvent, DotaEventTypes } from '../../../types.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisDenied}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    let playerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
    if (playerIdIndex === -1) {
      playerIdIndex = event.player_id
    }
    const heroName = getHeroNameOrColor(matchPlayers[playerIdIndex]?.heroid ?? 0, playerIdIndex)

    say(
      dotaClient.client,
      t('aegis.denied', { lng: dotaClient.client.locale, heroName, emote: 'ICANT' }),
      { chattersKey: 'roshDeny' },
    )
  },
})
