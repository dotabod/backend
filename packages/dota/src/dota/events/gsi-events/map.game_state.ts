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

    if (draftStates.includes(gameState) && dotaClient.client.Account?.providerAccountId) {
      try {
        const api = getTwitchAPI(dotaClient.client.Account?.providerAccountId)

        // Crate a marker
        api.streams
          .createStreamMarker(
            dotaClient.client.Account?.providerAccountId,
            'Draft phase in obs blockers',
          )
          .catch((e) => {
            logger.error('err createMarker', {
              e,
              name: dotaClient.client.name,
              matchId: dotaClient.client.gsi?.map?.matchid,
            })
          })

        api.clips
          .createClip({
            channel: dotaClient.client.Account?.providerAccountId,
            createAfterDelay: true,
          })
          .then((clipId) => {
            logger.info('Draft phase in obs blockers', {
              state: gameState,
              name: dotaClient.client.name,
              matchId: dotaClient.client.gsi?.map?.matchid,
              clipId,
            })

            api.clips.getClipById(clipId).then((clip) => {
              logger.info('Created clip', {
                state: gameState,
                name: dotaClient.client.name,
                matchId: dotaClient.client.gsi?.map?.matchid,
                clipId,
                url: clip?.url,
              })
            })
          })
          .catch((e) => {
            logger.error('err createClip', {
              e,
              name: dotaClient.client.name,
              matchId: dotaClient.client.gsi?.map?.matchid,
            })
          })
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
