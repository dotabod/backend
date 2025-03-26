import type { GSIHandler } from '../../GSIHandler.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'
import type { allStates } from '../../lib/consts.js'
import { logger } from '../../../utils/logger.js'
import { getTwitchAPI } from '../../../twitch/lib/getTwitchAPI.js'
import { is8500Plus } from '../../../utils/index.js'

eventHandler.registerEvent('map:game_state', {
  handler: async (dotaClient: GSIHandler, gameState: (typeof allStates)[number]) => {
    // Early returns for invalid conditions
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return
    if (!['DOTA_GAMERULES_STATE_STRATEGY_TIME'].includes(gameState)) return

    // Extract common log context
    const logContext = {
      name: dotaClient.client.name,
      matchId: dotaClient.client.gsi?.map?.matchid,
      state: gameState,
    }

    // Only create a clip if the user is >= 8500 MMR or has an immortal rank
    if (!is8500Plus(dotaClient.client)) {
      logger.info('User is not 8500+ MMR, skipping clip creation', {
        ...logContext,
        SteamAccount: dotaClient.client.SteamAccount,
        client: dotaClient.client.Account,
      })
      return
    }

    const accountId = dotaClient.client.Account?.providerAccountId
    if (!accountId) {
      logger.error('No account ID found', {
        ...logContext,
        client: dotaClient.client.Account,
      })
      return
    }

    // Create clip after delay
    const CLIP_DELAY_MS = 50000 // 50 seconds

    setTimeout(async () => {
      try {
        const api = getTwitchAPI(accountId)
        const clipId = await api.clips.createClip({
          createAfterDelay: true,
          channel: accountId,
        })

        logger.info('Clip created', {
          ...logContext,
          url: `clips.twitch.tv/${clipId}`,
        })

        // Process the clip
        try {
          const visionApiHost = process.env.VISION_API_HOST
          if (!visionApiHost) {
            throw new Error('VISION_API_HOST environment variable not set')
          }
          // Fire and forget - don't wait for the response
          fetch(
            `https://${visionApiHost}/detect?clip_id=${clipId}&match_id=${dotaClient.client.gsi?.map?.matchid}`,
            {
              headers: {
                'X-API-Key': process.env.VISION_API_KEY || '',
              },
            },
          ).catch((error) => {
            logger.error('Error sending clip processing request', {
              ...logContext,
              error: error.message,
              clipId,
            })
          })
        } catch (processingError: any) {
          logger.error('Error processing clip', {
            ...logContext,
            error: processingError.message,
            clipId,
          })
        }
      } catch (clipError: any) {
        logger.error('Error creating clip', {
          ...logContext,
          error: clipError.message,
        })
      }
    }, CLIP_DELAY_MS)
  },
})
