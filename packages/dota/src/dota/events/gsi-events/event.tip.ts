import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { GSIHandler, redisClient } from '../../GSIHandler.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.Tip}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    const heroName = getHeroNameOrColor(
      matchPlayers[event.sender_player_id]?.heroid ?? 0,
      event.sender_player_id,
    )

    const playingHeroSlot = Number(
      await redisClient.client.get(`${dotaClient.getToken()}:playingHeroSlot`),
    )
    if (event.receiver_player_id === playingHeroSlot) {
      say(
        dotaClient.client,
        t('tip.from', { emote: 'ICANT', lng: dotaClient.client.locale, heroName }),
        { chattersKey: 'tip' },
      )
    }

    if (event.sender_player_id === playingHeroSlot) {
      const toHero = getHeroNameOrColor(
        matchPlayers[event.receiver_player_id]?.heroid ?? 0,
        event.receiver_player_id,
      )

      say(
        dotaClient.client,
        t('tip.to', { emote: 'PepeLaugh', lng: dotaClient.client.locale, heroName: toHero }),
        { chattersKey: 'tip' },
      )
    }
  },
})
