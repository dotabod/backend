import type { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import type { allStates } from '../../lib/consts.js'
import { logger } from '../../../utils/logger.js'
import { draftStates } from '../../lib/consts.js'
import { getTwitchAPI } from '../../../twitch/lib/getTwitchAPI.js'

eventHandler.registerEvent('map:game_state', {
  handler: (dotaClient: GSIHandler, gameState: (typeof allStates)[number]) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return

    const accountId = dotaClient.client.Account?.providerAccountId
    if (draftStates.includes(gameState) && accountId) {
      try {
        const api = getTwitchAPI(accountId)

        // Create clip after 30 seconds delay
        setTimeout(() => {
          api.clips
            .createClip({
              channel: accountId,
            })
            .then((clipId) => {
              logger.info('Clip created', {
                state: gameState,
                name: dotaClient.client.name,
                matchId: dotaClient.client.gsi?.map?.matchid,
                url: `clips.twitch.tv/${clipId}`,
              })
            })
            .catch((e) => {
              logger.error('err createClip', {
                e,
                name: dotaClient.client.name,
                matchId: dotaClient.client.gsi?.map?.matchid,
              })
            })
        }, 30000)
      } catch (e) {
        logger.error('err createClip', {
          e,
          name: dotaClient.client.name,
          matchId: dotaClient.client.gsi?.map?.matchid,
        })
      }
    }
  },
})
