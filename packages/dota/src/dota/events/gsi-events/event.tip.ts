import { t } from 'i18next'

import { DotaEventTypes, type TipEvent } from '../../../types'
import { getRedisNumberValue } from '../../../utils/index'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { say } from '../../say'
import eventHandler from '../EventHandler'

eventHandler.registerEvent(`event:${DotaEventTypes.Tip}`, {
  handler: async (dotaClient, event: TipEvent) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    // tip events carry sender_player_id / receiver_player_id, NOT player_id —
    // the fallback must use those, or the index becomes undefined and tips break.
    let senderPlayerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.sender_player_id)
    if (senderPlayerIdIndex === -1) {
      senderPlayerIdIndex = event.sender_player_id
    }

    let receiverPlayerIdIndex = matchPlayers.findIndex(
      (p) => p.playerid === event.receiver_player_id,
    )
    if (receiverPlayerIdIndex === -1) {
      receiverPlayerIdIndex = event.receiver_player_id
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
