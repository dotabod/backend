import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { GSIHandler } from '../../GSIHandler.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.AegisDenied}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    const heroName = getHeroNameOrColor(matchPlayers[event.player_id]?.heroid ?? 0, event.player_id)

    say(
      dotaClient.client,
      t('aegis.denied', { lng: dotaClient.client.locale, heroName, emote: 'ICANT' }),
      { chattersKey: 'roshDeny' },
    )
  },
})
