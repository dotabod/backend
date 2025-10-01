import { type ChatEventData, type DotaEvent, DotaEventTypes } from '../../../types.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.GenericEvent}`, {
  handler: async (dotaClient, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    try {
      const data = JSON.parse(event.data ?? '{}') as ChatEventData

      // Game abandoned type of events
      const gameAbandonedTypes = [
        'CHAT_MESSAGE_WILL_NOT_BE_SCORED',
        'CHAT_MESSAGE_SAFE_TO_LEAVE',
        'CHAT_MESSAGE_CAN_QUIT_WITHOUT_ABANDON',
        'CHAT_MESSAGE_WILL_NOT_BE_SCORED_RANKED',
      ]
      if (gameAbandonedTypes.includes(data.type)) {
        // TODO: Handle game abandoned events
        return
      }

      const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

      let playerIdIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
      if (playerIdIndex === -1) {
        playerIdIndex = event.player_id
      }
      const heroName = getHeroNameOrColor(matchPlayers[playerIdIndex]?.heroid ?? 0, playerIdIndex)
    } catch {
      return
    }
  },
})
