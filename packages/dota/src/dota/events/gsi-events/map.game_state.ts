import { logger } from '@dotabod/shared-utils'
import { DBSettings, getValueOrDefault } from '../../../settings'
import { is8500Plus } from '../../../utils/index'
import { getStreamDelay } from '../../getStreamDelay'
import { DRAFT_CLIP_OPTS, GAMEPLAY_CLIP_OPTS, scheduleClip } from '../../lib/clipSchedule'
import {
  type allStates,
  draftStartByMatchId,
  GLOBAL_DELAY,
  gameInProgressClipByMatchId,
} from '../../lib/consts'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import eventHandler from '../EventHandler'

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
      await scheduleClip(DRAFT_CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, {
        accountId,
        matchId: dotaClient.client.gsi?.map?.matchid,
        detectPath: 'detect_draft',
        opts: DRAFT_CLIP_OPTS,
        logPrefix: '[Draft Clip]',
        logContext,
      })
      return
    }

    if ('DOTA_GAMERULES_STATE_STRATEGY_TIME' === gameState) {
      const CLIP_DELAY_MS = 50000 // 50 seconds
      const streamDelay = getStreamDelay(dotaClient.client.settings, dotaClient.client.subscription)

      await scheduleClip(CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, {
        accountId,
        matchId: dotaClient.client.gsi?.map?.matchid,
        detectPath: 'detect',
        opts: GAMEPLAY_CLIP_OPTS,
        logPrefix: '[Clip]',
        logContext,
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

      await scheduleClip(IN_GAME_CLIP_DELAY_MS + streamDelay - GLOBAL_DELAY, {
        accountId,
        matchId,
        detectPath: 'detect_in_game',
        opts: GAMEPLAY_CLIP_OPTS,
        logPrefix: '[In-Game Clip]',
        logContext,
      })
    }
  },
})
