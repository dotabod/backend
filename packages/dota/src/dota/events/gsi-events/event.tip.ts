import { t } from 'i18next'

import { type DotaEvent, DotaEventTypes } from '../../../types.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'
import { getRedisNumberValue } from '../../../utils/index.js'

eventHandler.registerEvent(`event:${DotaEventTypes.Tip}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    let senderPlayerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.sender_player_id)
    if (senderPlayerIdIndex === -1) {
      senderPlayerIdIndex = event.player_id
    }

    let receiverPlayerIdIndex = matchPlayers.findIndex(
      (p) => p.playerid === event.receiver_player_id,
    )
    if (receiverPlayerIdIndex === -1) {
      receiverPlayerIdIndex = event.player_id
    }
    const heroName = getHeroNameOrColor(
      matchPlayers[senderPlayerIdIndex]?.heroid ?? 0,
      senderPlayerIdIndex,
    )

    const playingHeroSlot = await getRedisNumberValue(`${dotaClient.getToken()}:playingHeroSlot`)

    if (receiverPlayerIdIndex === playingHeroSlot) {
      say(
        dotaClient.client,
        t('tip.from', { emote: 'ICANT', lng: dotaClient.client.locale, heroName }),
        { chattersKey: 'tip' },
      )
    }

    if (senderPlayerIdIndex === playingHeroSlot) {
      const toHero = getHeroNameOrColor(
        matchPlayers[receiverPlayerIdIndex]?.heroid ?? 0,
        receiverPlayerIdIndex,
      )

      say(
        dotaClient.client,
        t('tip.to', { emote: 'PepeLaugh', lng: dotaClient.client.locale, heroName: toHero }),
        { chattersKey: 'tip' },
      )
    }
  },
})
