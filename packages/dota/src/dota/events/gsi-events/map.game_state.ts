import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { is8500Plus } from '../../../utils/index.js'
import type { allStates } from '../../lib/consts.js'
import { delayedQueue } from '../../lib/DelayedQueue.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent('map:game_state', {
  handler: async (dotaClient, gameState: (typeof allStates)[number]) => {
    // Early returns for invalid conditions
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return

    if (
      !['DOTA_GAMERULES_STATE_STRATEGY_TIME', 'DOTA_GAMERULES_STATE_PLAYER_DRAFT'].includes(
        gameState,
      )
    )
      return

    // Only create a clip if the user is >= 8500 MMR or has an immortal rank
    if (!is8500Plus(dotaClient.client)) {
      return
    }

    // Check if auto clipping is disabled
    const autoClippingEnabled = !getValueOrDefault(
      DBSettings.disableAutoClipping,
      dotaClient.client.settings,
      dotaClient.client.subscription,
    )
    if (!autoClippingEnabled) return

    // Extract common log context
    const logContext = {
      name: dotaClient.client.name,
      matchId: dotaClient.client.gsi?.map?.matchid,
      state: gameState,
    }

    const accountId = dotaClient.client.Account?.providerAccountId
    if (!accountId) {
      logger.error('No account ID found', {
        ...logContext,
        client: dotaClient.client.Account,
      })
      return
    }

    // Create a clip when the draft starts to get a list of players
    if (['DOTA_GAMERULES_STATE_PLAYER_DRAFT'].includes(gameState)) {
      // Delay to ensure the draft has started
      delayedQueue.addTask(46000, async () => {
        try {
          const api = await getTwitchAPI(accountId)
          const clipId = await api.clips.createClip({
            createAfterDelay: true,
            channel: accountId,
          })

          logger.info('Draft clip created', { ...logContext, clipId })

          // Process the clip
          try {
            const visionApiHost = process.env.VISION_API_HOST
            if (!visionApiHost) {
              throw new Error('VISION_API_HOST environment variable not set')
            }
            // Fire and forget - don't wait for the response
            // TODO: Make an API that accepts processing this new clip state
            // fetch(
            //   `https://${visionApiHost}/detect_draft?clip_id=${clipId}&match_id=${dotaClient.client.gsi?.map?.matchid}`,
            //   {
            //     headers: {
            //       'X-API-Key': process.env.VISION_API_KEY || '',
            //     },
            //   },
            // ).catch((error) => {
            //   logger.error('Error sending draft clip processing request', {
            //     ...logContext,
            //     error: error.message,
            //     clipId,
            //   })
            // })

            // Add clip to the deletion queue instead of using setTimeout
            // addClipToDeletionQueue(accountId, clipId)
            // We can't delete clips :(
          } catch (processingError: any) {
            logger.error('Error processing draft clip', {
              ...logContext,
              error: processingError.message,
              clipId,
            })
          }
        } catch (clipError: any) {
          logger.error('Error creating draft clip', {
            ...logContext,
            error: clipError.message,
          })
        }
      })
      return
    }

    if (!['DOTA_GAMERULES_STATE_STRATEGY_TIME'].includes(gameState)) return

    // Create clip after delay
    const CLIP_DELAY_MS = 50000 // 50 seconds

    delayedQueue.addTask(CLIP_DELAY_MS, async () => {
      try {
        const api = await getTwitchAPI(accountId)
        const clipId = await api.clips.createClip({
          createAfterDelay: true,
          channel: accountId,
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

          // Add clip to the deletion queue instead of using setTimeout
          // addClipToDeletionQueue(accountId, clipId)
          // We can't delete clips :(
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
    })
  },
})
