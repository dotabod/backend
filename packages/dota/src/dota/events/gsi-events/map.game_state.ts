import type { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import type { allStates } from '../../lib/consts.js'
import { logger } from '../../../utils/logger.js'
import { draftStates } from '../../lib/consts.js'

eventHandler.registerEvent('map:game_state', {
  handler: (dotaClient: GSIHandler, gameState: (typeof allStates)[number]) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    if (draftStates.includes(gameState)) {
      // TODO: Clip the draft phase with Twitch API
      logger.info('Draft phase in map event', {
        state: gameState,
        name: dotaClient.client.name,
        matchId: dotaClient.client.gsi?.map?.matchid,
      })
    }
  },
})
