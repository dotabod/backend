import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../types.js'
import eventHandler from '../events/EventHandler.js'
import { GSIHandler } from '../GSIHandler.js'
import { getHeroNameById } from '../lib/heroes.js'
import { isPlayingMatch } from '../lib/isPlayingMatch.js'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisDenied}`, {
  handler: (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const heroName = getHeroNameById(
      dotaClient.players?.matchPlayers[event.player_id].heroid ?? 0,
      event.player_id,
    )

    dotaClient.say(t('aegis.denied', { lng: dotaClient.client.locale, heroName, emote: 'ICANT' }), {
      beta: true,
    })
  },
})
