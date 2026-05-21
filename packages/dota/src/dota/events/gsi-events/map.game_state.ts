import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import type { ApiClient } from '@twurple/api'
import { DBSettings, getValueOrDefault } from '../../../settings'
import { is8500Plus } from '../../../utils/index'
import { getStreamDelay } from '../../getStreamDelay'
import { type allStates, draftStartByMatchId, GLOBAL_DELAY } from '../../lib/consts'
import { delayedQueue } from '../../lib/DelayedQueue'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import eventHandler from '../EventHandler'

// Twitch needs time to transcode a freshly captured clip. Until it does, the
// clip reports duration 0 and its video renditions 404, so the vision processor
// has no frame to analyze. Poll until the clip is transcoded before submitting.
async function waitForClipReady(
  api: ApiClient,
  clipId: string,
  logContext: Record<string, unknown>,
): Promise<boolean> {
  const MAX_ATTEMPTS = 6
  const POLL_INTERVAL_MS = 5000
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const clip = await api.clips.getClipById(clipId)
      if (clip && clip.duration > 0) return true
    } catch (error: any) {
      logger.warn('[Clip] Error checking clip readiness', {
        ...logContext,
        clipId,
        attempt,
        error: error.message,
      })
    }
    if (attempt < MAX_ATTEMPTS)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return false
}

async function createAndSubmitClip(
  accountId: string,
  matchId: string | undefined,
  detectPath: 'detect' | 'detect_draft',
  logPrefix: string,
  logContext: Record<string, unknown>,
): Promise<void> {
  try {
    const api = await getTwitchAPI(accountId)
    const clipId = await api.clips.createClip({
      createAfterDelay: true,
      channel: accountId,
    })

    logger.info(`${logPrefix} clip created`, { ...logContext, clipId })

    const ready = await waitForClipReady(api, clipId, logContext)
    if (!ready) {
      logger.error(`${logPrefix} clip never finished transcoding; skipping vision submission`, {
        ...logContext,
        clipId,
      })
      return
    }

    const visionApiHost = process.env.VISION_API_HOST
    if (!visionApiHost) {
      logger.error(`${logPrefix} No VISION_API_HOST set`, logContext)
      return
    }

    // Fire and forget - don't wait for the response
    fetch(`https://${visionApiHost}/${detectPath}?clip_id=${clipId}&match_id=${matchId}`, {
      headers: {
        'X-API-Key': process.env.VISION_API_KEY || '',
      },
    }).catch((error) => {
      logger.error(`${logPrefix} Error sending clip processing request`, {
        ...logContext,
        error: error.message,
        clipId,
      })
    })
  } catch (clipError: any) {
    logger.error(`${logPrefix} Error creating clip`, {
      ...logContext,
      error: clipError.message,
    })
  }
}

eventHandler.registerEvent('map:game_state', {
  handler: async (dotaClient, gameState: (typeof allStates)[number]) => {
    // Early returns for invalid conditions
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return

    if (
      !['DOTA_GAMERULES_STATE_STRATEGY_TIME', 'DOTA_GAMERULES_STATE_PLAYER_DRAFT'].includes(
        gameState,
      )
    ) {
      return
    }

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
    if (!autoClippingEnabled) {
      return
    }

    // Extract common log context
    const logContext = {
      name: dotaClient.client.name,
      matchId: dotaClient.client.gsi?.map?.matchid,
      state: gameState,
    }

    const accountId = dotaClient.client.Account?.providerAccountId
    if (!accountId) {
      logger.error('[Draft Clip] No account ID found', {
        ...logContext,
        client: dotaClient.client.Account,
      })
      return
    }

    // Create a clip when the draft starts to get a list of players
    if ('DOTA_GAMERULES_STATE_PLAYER_DRAFT' === gameState) {
      draftStartByMatchId.set(dotaClient.client.gsi?.map?.matchid || '', true)
      const DRAFT_CLIP_DELAY_MS = 46000 // 46 seconds
      const streamDelay = getStreamDelay(dotaClient.client.settings, dotaClient.client.subscription)
      logger.info(
        '[Draft Clip] Draft started, creating clip in 46 seconds + stream delay',
        logContext,
      )

      // Delay to ensure the draft has started
      delayedQueue.addTask(DRAFT_CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, async () => {
        await createAndSubmitClip(
          accountId,
          dotaClient.client.gsi?.map?.matchid,
          'detect_draft',
          '[Draft Clip]',
          logContext,
        )
      })
      return
    }

    if ('DOTA_GAMERULES_STATE_STRATEGY_TIME' === gameState) {
      const CLIP_DELAY_MS = 50000 // 50 seconds
      const streamDelay = getStreamDelay(dotaClient.client.settings, dotaClient.client.subscription)

      delayedQueue.addTask(CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, async () => {
        await createAndSubmitClip(
          accountId,
          dotaClient.client.gsi?.map?.matchid,
          'detect',
          '[Clip]',
          logContext,
        )
      })
    }
  },
})
