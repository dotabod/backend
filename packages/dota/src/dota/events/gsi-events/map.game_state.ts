import type { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import type { allStates } from '../../lib/consts.js'
import { logger } from '../../../utils/logger.js'
import { getTwitchAPI } from '../../../twitch/lib/getTwitchAPI.js'
import { is8500Plus } from '../../../utils/index.js'

eventHandler.registerEvent('map:game_state', {
  handler: (dotaClient: GSIHandler, gameState: (typeof allStates)[number]) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return

    // Only create a clip if the user is >= 8500 MMR or has an immortal rank
    if (!is8500Plus(dotaClient.client)) {
      return
    }

    const accountId = dotaClient.client.Account?.providerAccountId
    if (['DOTA_GAMERULES_STATE_STRATEGY_TIME'].includes(gameState) && accountId) {
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
