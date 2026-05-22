import { t } from 'i18next'

import { DotaEventTypes, type TipEvent } from '../../../types'
import { getRedisNumberValue, is8500Plus } from '../../../utils/index'
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
    // sub-8500 may use the player-slot color; 8500+ only names a real resolved
    // hero (player_id is reshuffled there), else a generic message — see aegis.
    const high = is8500Plus(dotaClient.client)
    const senderHeroid = matchPlayers[senderPlayerIdIndex]?.heroid
    const heroName =
      senderHeroid || !high ? getHeroNameOrColor(senderHeroid ?? 0, senderPlayerIdIndex) : null

    const playingHeroSlot = await getRedisNumberValue(`${dotaClient.getToken()}:playingHeroSlot`)

    if (receiverPlayerIdIndex === playingHeroSlot) {
      say(
        dotaClient.client,
        heroName
          ? t('tip.from', { emote: 'ICANT', lng: dotaClient.client.locale, heroName })
          : t('tip.fromUnknown', { emote: 'ICANT', lng: dotaClient.client.locale }),
        { chattersKey: 'tip' },
      )
    }

    if (senderPlayerIdIndex === playingHeroSlot) {
      const receiverHeroid = matchPlayers[receiverPlayerIdIndex]?.heroid
      const toHero =
        receiverHeroid || !high
          ? getHeroNameOrColor(receiverHeroid ?? 0, receiverPlayerIdIndex)
          : null

      say(
        dotaClient.client,
        toHero
          ? t('tip.to', { emote: 'PepeLaugh', lng: dotaClient.client.locale, heroName: toHero })
          : t('tip.toUnknown', { emote: 'PepeLaugh', lng: dotaClient.client.locale }),
        { chattersKey: 'tip' },
      )
    }
  },
})
