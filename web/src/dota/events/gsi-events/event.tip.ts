import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { GSIHandler } from '../../GSIHandler.js'
import { getHeroNameById } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.Tip}`, {
  handler: (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      tip: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chattersEnabled || !chatterEnabled) return

    const heroName = getHeroNameById(
      dotaClient.players?.matchPlayers[event.sender_player_id].heroid ?? 0,
      event.sender_player_id,
    )

    if (event.receiver_player_id === dotaClient.playingHeroSlot) {
      dotaClient.say(t('tip.from', { emote: 'ICANT', lng: dotaClient.client.locale, heroName }))
    }

    if (event.sender_player_id === dotaClient.playingHeroSlot) {
      const toHero = getHeroNameById(
        dotaClient.players?.matchPlayers[event.receiver_player_id].heroid ?? 0,
        event.receiver_player_id,
      )

      dotaClient.say(
        t('tip.to', { emote: 'PepeLaugh', lng: dotaClient.client.locale, heroName: toHero }),
      )
    }
  },
})
