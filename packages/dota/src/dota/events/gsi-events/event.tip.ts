import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { GSIHandler, redisClient, say } from '../../GSIHandler.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.Tip}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      tip: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (!chattersEnabled || !chatterEnabled) return

    const { matchPlayers } = await getAccountsFromMatch(dotaClient.client.gsi)

    const heroName = getHeroNameById(
      matchPlayers[event.sender_player_id].heroid ?? 0,
      event.sender_player_id,
    )

    const playingHeroSlot = Number(
      await redisClient.client.get(`${dotaClient.getToken()}:playingHeroSlot`),
    )
    if (event.receiver_player_id === playingHeroSlot) {
      say(
        dotaClient.client,
        t('tip.from', { emote: 'ICANT', lng: dotaClient.client.locale, heroName }),
      )
    }

    if (event.sender_player_id === playingHeroSlot) {
      const toHero = getHeroNameById(
        matchPlayers[event.receiver_player_id].heroid ?? 0,
        event.receiver_player_id,
      )

      say(
        dotaClient.client,
        t('tip.to', { emote: 'PepeLaugh', lng: dotaClient.client.locale, heroName: toHero }),
      )
    }
  },
})
