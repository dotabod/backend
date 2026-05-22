import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../../settings'
import { is8500Plus } from '../../../utils/index'
import { getStreamDelay } from '../../getStreamDelay'
import {
  type allStates,
  draftStartByMatchId,
  GLOBAL_DELAY,
  gameInProgressClipByMatchId,
} from '../../lib/consts'
import { type CreateReadyClipOptions, createReadyClip } from '../../lib/createReadyClip'
import { delayedQueue } from '../../lib/DelayedQueue'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import eventHandler from '../EventHandler'

async function createAndSubmitClip(
  accountId: string,
  matchId: string | undefined,
  detectPath: 'detect' | 'detect_draft' | 'detect_in_game',
  opts: CreateReadyClipOptions,
  logPrefix: string,
  logContext: Record<string, unknown>,
): Promise<void> {
  try {
    const api = await getTwitchAPI(accountId)
    const clipId = await createReadyClip(api, accountId, opts, logPrefix, logContext)

    if (!clipId) {
      logger.error(`${logPrefix} no usable clip after retries; skipping vision submission`, {
        ...logContext,
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
  } catch (clipError) {
    logger.error(`${logPrefix} Error creating clip`, {
      ...logContext,
      error: (clipError as Error).message,
    })
  }
}

// Heroes stay on the HUD all game, so retry generously with no deadline.
const GAMEPLAY_CLIP_OPTS: CreateReadyClipOptions = {
  maxAttempts: 3,
  pollAttempts: 3,
  pollIntervalMs: 5000,
}

// The draft screen is only visible briefly, so keep the retry budget time-boxed,
// but give the FIRST clip a long enough poll window (~20s) to outlast Twitch's
// ~15s transcode. Recreating a clip restarts that transcode clock, so the old
// too-short window (2 x 4s = ~8s) abandoned every clip mid-transcode and failed
// ~100% of the time. Polling the same clip longer doesn't move its content
// (createAfterDelay captured the buffer at creation), so the draft UI is intact.
const DRAFT_CLIP_OPTS: CreateReadyClipOptions = {
  maxAttempts: 2,
  pollAttempts: 5,
  pollIntervalMs: 5000,
  deadlineMs: 45000,
}

eventHandler.registerEvent('map:game_state', {
  handler: async (dotaClient, gameState: (typeof allStates)[number]) => {
    // Early returns for invalid conditions
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi, false)) return

    if (
      ![
        'DOTA_GAMERULES_STATE_STRATEGY_TIME',
        'DOTA_GAMERULES_STATE_PLAYER_DRAFT',
        'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      ].includes(gameState)
    ) {
      return
    }

    // In-game capture is gated off until the processor's top-bar detection
    // (/detect_in_game) ships. Short-circuit before the work below so disabling
    // it costs nothing on every game-start transition.
    if (
      'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' === gameState &&
      process.env.VISION_IN_GAME_ENABLED !== 'true'
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
          DRAFT_CLIP_OPTS,
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
          GAMEPLAY_CLIP_OPTS,
          '[Clip]',
          logContext,
        )
      })
      return
    }

    // The in-game top HUD hero bar shows all 10 heroes for the whole match and is
    // less likely to be covered by OBS overlays than the pre-game screens, so grab
    // an extra clip once the player has loaded in.
    if ('DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' === gameState) {
      const matchId = dotaClient.client.gsi?.map?.matchid || ''
      if (gameInProgressClipByMatchId.get(matchId)) return
      gameInProgressClipByMatchId.set(matchId, true)

      const IN_GAME_CLIP_DELAY_MS = 60000 // settle ~1 min in; top bar is up all game
      const streamDelay = getStreamDelay(dotaClient.client.settings, dotaClient.client.subscription)

      delayedQueue.addTask(IN_GAME_CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, async () => {
        await createAndSubmitClip(
          accountId,
          matchId,
          'detect_in_game',
          GAMEPLAY_CLIP_OPTS,
          '[In-Game Clip]',
          logContext,
        )
      })
    }
  },
})
