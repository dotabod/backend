import http from 'node:http'
import { getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import cors from 'cors'
import express, {
  type ErrorRequestHandler,
  json,
  type Request,
  type Response,
  urlencoded,
} from 'express'
import bodyParserErrorHandler from 'express-body-parser-error-handler'
import { Server, type Socket } from 'socket.io'
import getDBUser from '../db/getDBUser'
import { getWL } from '../db/getWL'
import { MAX_WL_STATS_DAYS, normalizeStatsStartDate } from '../db/winLossWindow'
import { twitchEvent } from '../twitch/index'
import type { Ability, Item } from '../types'
import { initDotaPatchChecker } from './DotaPatchChecker'
import { getDiagnosticPayload } from './diagnosticPayload'
import { emitMinimapBlockerStatus } from './GSIHandler'
import type { GSIServerInterface } from './GSIServerTypes'
import {
  newData,
  processChanges,
  processUnmarkedKillListChanges,
  recoverMultiAccount,
} from './globalEventEmitter'
import { gsiHandlers } from './lib/consts'
import { isGsiFresh } from './lib/getCurrentMatchId'
import { MatchDataService } from './lib/matchData'
import { remindUnresolvedMatches } from './lib/remindUnresolvedMatches'
import { deleteClipsBatch } from './lib/twitchUtils'
import { recordOverlaySocketActivity } from './setupSignals'
import { validateToken } from './validateToken'
import {
  getWinLossRoom,
  WIN_LOSS_PREVIEW_CLIENT_TYPE,
  WIN_LOSS_PROFILE_CLIENT_TYPE,
} from './winLossSocket'

// --- Clip Deletion Queue ---
// Map<accountId: string, Set<clipSlug: string>>
const clipsToDeleteQueue = new Map<string, Set<string>>()
let isProcessingDeleteQueue = false // Simple lock
const _CLIP_DELETE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const STALE_OVERLAY_CHECK_INTERVAL_MS = 15_000
// --- End Clip Deletion Queue ---

function emitInactiveOverlayState(io: Server, token: string) {
  io.to(token).emit('block', {
    type: null,
    state: 'GSI_STALE',
    team: null,
    matchId: null,
  })
  io.to(token).emit('notable-players', [])
}

function handleSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const { client: clientType, token, twitchId } = socket.handshake.auth
  const lookup =
    clientType === WIN_LOSS_PROFILE_CLIENT_TYPE && typeof twitchId === 'string'
      ? { twitchId }
      : { token }

  const authenticate = (attempt = 0) => {
    getDBUser(lookup)
      .then(({ reason, result: client }) => {
        if (client?.token) {
          socket.data.clientType = clientType
          socket.data.dotabodClient = client
          next()
          return
        }

        if (reason === 'Token is currently being looked up' && attempt < 20) {
          setTimeout(() => authenticate(attempt + 1), 100)
          return
        }

        socket.emit('auth_error', 'Invalid token')
        socket.disconnect(true)
      })
      .catch((e) => {
        logger.info('[GSI] Error checking auth', { token, twitchId, e })
        socket.emit('auth_error', 'Authentication error')
        socket.disconnect(true)
      })
  }

  authenticate()
}

async function handleSocketConnection(socket: Socket) {
  const { token } = socket.handshake.auth
  const client = socket.data?.dotabodClient ?? gsiHandlers.get(token)?.client
  const isWinLossPreview = socket.data?.clientType === WIN_LOSS_PREVIEW_CLIENT_TYPE
  const isWinLossProfile = socket.data?.clientType === WIN_LOSS_PROFILE_CLIENT_TYPE
  const isSetupDiagnostic = socket.data?.clientType === 'setup-diagnostic'
  const twitchId = client?.Account?.providerAccountId

  if (isSetupDiagnostic) {
    socket.emit('diagnostic-ready', { status: 'ok' })
    return
  }

  if ((isWinLossPreview || isWinLossProfile) && twitchId) {
    await socket.join(getWinLossRoom(twitchId))

    socket.on(
      'request-wl',
      async (
        request: { statsDays?: unknown; statsStartDate?: unknown } | undefined,
        respond: (response: unknown) => void,
      ) => {
        const hasStatsDaysOverride = Object.hasOwn(request ?? {}, 'statsDays')
        const hasStatsStartDateOverride = Object.hasOwn(request ?? {}, 'statsStartDate')
        const hasOverride = hasStatsDaysOverride || hasStatsStartDateOverride
        const statsDays = request?.statsDays
        const statsStartDate = request?.statsStartDate
        if (hasOverride && !isWinLossPreview) {
          respond({ error: 'Stats window overrides are only available in settings' })
          return
        }
        if (
          hasStatsDaysOverride &&
          statsDays !== null &&
          (!Number.isInteger(statsDays) ||
            Number(statsDays) < 1 ||
            Number(statsDays) > MAX_WL_STATS_DAYS)
        ) {
          respond({ error: 'Invalid stats window' })
          return
        }
        if (
          hasStatsStartDateOverride &&
          statsStartDate !== null &&
          normalizeStatsStartDate(statsStartDate) === null
        ) {
          respond({ error: 'Invalid stats start date' })
          return
        }

        try {
          const result = await getWL({
            channelId: twitchId,
            lng: client.locale,
            mmrEnabled: false,
            settings: client.settings,
            statsDaysOverride: hasStatsDaysOverride ? (statsDays as number | null) : undefined,
            statsStartDateOverride: hasStatsStartDateOverride
              ? (statsStartDate as string | null)
              : undefined,
            streamStartDate: client.stream_start_date,
            subscription: client.subscription,
            userId: client.token,
          })
          respond({
            records: result.record,
            statsDays: result.statsDays,
            statsDaysTotal: result.statsDaysTotal,
          })
        } catch (error) {
          logger.error('[GSI] Error loading WL socket data', {
            error,
            token: client.token,
          })
          respond({ error: 'Unable to load win/loss record' })
        }
      },
    )
    return
  }

  await socket.join(token)

  // Signal that this user's overlay browser source has connected at least once.
  // Drives the setup wizard's Step 3 verify-state. Cached + idempotent.
  recordOverlaySocketActivity(token)
  socket.on('diagnostic-heartbeat', () => recordOverlaySocketActivity(token))

  const handler = gsiHandlers.get(token)
  if (handler && !handler.disabled && handler.client.stream_online) {
    if (handler.client.gsi && handler.client.beta_tester) {
      emitMinimapBlockerStatus(handler.client)
    }
    handler.emitBadgeUpdate()
    handler.emitWLUpdate()
    handler.blockCache = undefined
    if (isGsiFresh(handler.client)) {
      await handler.setupOBSBlockers(handler.client.gsi?.map?.game_state ?? '')
    } else {
      socket.emit('block', {
        type: null,
        state: 'GSI_STALE',
        team: null,
        matchId: null,
      })
      socket.emit('notable-players', [])
    }
  }
}

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://dotabod.com',
  'https://dev.dotabod.com',
  'https://tooltips.dotabod.com',
]

class GSIServer implements GSIServerInterface {
  io: Server

  constructor() {
    logger.info('Starting GSI Server!')

    const app = express()
    const httpServer = http.createServer(app)
    this.io = new Server(httpServer, {
      pingTimeout: 60_000,
      pingInterval: 15000,
      cors: {
        origin: allowedOrigins,
      },
    })

    app.use(cors({ origin: allowedOrigins }))
    app.use(json({ limit: '1mb' }))
    app.use(urlencoded({ extended: true, limit: '1mb' }))
    app.use(bodyParserErrorHandler() as unknown as ErrorRequestHandler)

    app.post(
      '/',
      (_req: Request, _res: Response, next: () => void) => {
        next()
      },
      validateToken,
      recoverMultiAccount,
      processChanges('previously'),
      processChanges('added'),
      processUnmarkedKillListChanges,
      newData,
    )

    // Track resubscribe request timestamps separately from regular GSI posts
    const resubscribeRequestTimestamps = new Map<string, number>()
    const RESUBSCRIBE_CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours
    const UNRESOLVED_REMINDER_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

    // Function to clean up old resubscribe request timestamps
    function cleanupResubscribeTimestamps() {
      const now = Date.now()
      for (const [token, timestamp] of resubscribeRequestTimestamps.entries()) {
        if (now - timestamp > RESUBSCRIBE_CLEANUP_TIMEOUT) {
          resubscribeRequestTimestamps.delete(token)
        }
      }
    }

    app.post('/resubscribe', async (req: Request, res: Response) => {
      const { token } = req.body
      if (!token) {
        res.status(404).json({ status: 'not found' })
        return
      }

      // get providerid from token
      const { data: user } = await supabase
        .from('accounts')
        .select('providerAccountId')
        .eq('userId', token)
        .single()

      if (!user?.providerAccountId) {
        res.status(404).json({ status: 'not found' })
        return
      }

      // Rate limiting - prevent abuse by limiting frequency of resubscribe requests
      const lastResubscribeRequestTime = resubscribeRequestTimestamps.get(token)
      const now = Date.now()
      const cooldownPeriod = 300000 // 5 minute cooldown between resubscribe requests

      if (lastResubscribeRequestTime && now - lastResubscribeRequestTime < cooldownPeriod) {
        logger.info('[GSI] Resubscribe request rate limited', { token })
        res.status(429).json({
          status: 'too many requests',
          retryAfter: Math.ceil((lastResubscribeRequestTime + cooldownPeriod - now) / 1000),
        })
        return
      }

      // Update timestamp for rate limiting
      resubscribeRequestTimestamps.set(token, now)

      twitchEvent.emit('resubscribe', user.providerAccountId)
      res.status(200).json({ status: 'ok' })
    })

    app.get('/tooltips/:channelId', async (req: Request, res: Response) => {
      const { channelId } = req.params
      // make sure channel id is a number
      if (typeof channelId !== 'string' || !channelId.match(/^\d+$/)) {
        res.status(200).json({ status: 'ok' })
        return
      }

      const { result: user } = await getDBUser({ twitchId: channelId })
      if (!user?.stream_online || !isGsiFresh(user)) {
        res.status(200).json({ status: 'ok' })
        return
      }

      const dotaClient = user.gsi
      const inv = Object.values(dotaClient?.items ?? {})
      const items: Item[] = inv.slice(0, 9)
      const roster = await new MatchDataService(user).resolveRoster()

      const messageToSend = {
        items: items.map((item) => item.name),
        neutral: dotaClient?.items?.neutral0?.name,
        hero: dotaClient?.hero?.id,
        abilities: dotaClient?.abilities
          ? Object.values(dotaClient?.abilities).map((ability: Ability) => ability.name)
          : [],
        heroes: roster.players.map((p) => p.heroId),
      }

      res.status(200).json(messageToSend)
    })

    app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    app.get('/diagnostics/payload', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store')
      res.type('text/plain').status(200).send(getDiagnosticPayload())
    })

    httpServer.listen(5120, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:${5120}`)
    })

    this.io.use(handleSocketAuth)
    this.io.on('connection', handleSocketConnection)
    this.io.on('connect_error', (err) => {
      logger.info('[GSI] io connect_error', { err })
    })
    this.io.on('disconnect', (reason) => {
      logger.info('[GSI] io disconnect', { reason })
    })

    // Set up the repeating timer for cleaning up resubscribe timestamps
    setInterval(cleanupResubscribeTimestamps, RESUBSCRIBE_CLEANUP_TIMEOUT)

    // Dota does not always send an INIT/POST_GAME packet when leaving a spectator or custom
    // game. Once its heartbeat expires, clear the browser source instead of leaving the last
    // match visible indefinitely. A fresh packet will repopulate the blocker on the next tick.
    setInterval(() => {
      for (const handler of gsiHandlers.values()) {
        if (
          handler.disabled ||
          !handler.client.stream_online ||
          !handler.blockCache ||
          isGsiFresh(handler.client)
        ) {
          continue
        }

        emitInactiveOverlayState(this.io, handler.client.token)
        handler.blockCache = undefined
      }
    }, STALE_OVERLAY_CHECK_INTERVAL_MS)

    // Nudge mods once per unresolved match while the stream is live
    setInterval(() => {
      remindUnresolvedMatches().catch((e) => {
        logger.error('[BETS] remindUnresolvedMatches failed', { e })
      })
    }, UNRESOLVED_REMINDER_INTERVAL_MS)

    // Initialize the Dota patch checker with a 5-minute check interval
    initDotaPatchChecker(5)

    // Set up repeating timer for batch clip deletion
    // setInterval(this.processClipDeletionQueue, CLIP_DELETE_INTERVAL_MS)
    // logger.info(`[GSI] Clip deletion interval started (${CLIP_DELETE_INTERVAL_MS}ms)`)
  }

  init(): GSIServerInterface {
    return this
  }

  /**
   * Processes the clip deletion queue, deleting clips in batches per user.
   */
  async processClipDeletionQueue(): Promise<void> {
    if (isProcessingDeleteQueue) {
      logger.warn('[GSI_ClipDelete] Deletion processing already in progress, skipping interval.')
      return
    }
    if (clipsToDeleteQueue.size === 0) {
      // logger.debug('[GSI_ClipDelete] Queue is empty, skipping processing.'); // Optional: debug logging
      return
    }

    logger.info(
      `[GSI_ClipDelete] Starting clip deletion queue processing (${clipsToDeleteQueue.size} users)`,
    )
    isProcessingDeleteQueue = true

    // Create a copy of the keys to iterate over, as the map might be modified during async operations
    const accountIds = [...clipsToDeleteQueue.keys()]

    for (const accountId of accountIds) {
      const slugsToDelete = clipsToDeleteQueue.get(accountId)
      if (!slugsToDelete || slugsToDelete.size === 0) {
        clipsToDeleteQueue.delete(accountId) // Clean up empty entry if somehow created
        continue
      }

      const slugsArray = [...slugsToDelete]
      const logContext = { accountId, clipCount: slugsArray.length }

      try {
        // 1. Get API client and token for the user
        const apiClient = await getTwitchAPI(accountId)
        const tokenInfo = await apiClient._authProvider.getAccessTokenForUser(accountId)

        if (!tokenInfo?.accessToken) {
          logger.error('[GSI_ClipDelete] Could not get auth token for user', logContext)
          // Decide if we should keep these slugs for the next run or discard?
          // For now, let's keep them and hope the token is available next time.
          continue // Skip to the next user
        }

        // 2. Call the batch delete function
        await deleteClipsBatch(slugsArray, tokenInfo.accessToken, logContext)

        // 3. Clear the processed slugs for this user from the main queue
        // Check if the set still exists in case it was cleared/modified elsewhere
        const currentSet = clipsToDeleteQueue.get(accountId)
        if (currentSet) {
          slugsArray.forEach((slug) => {
            currentSet.delete(slug)
          })
          // If the set becomes empty after deletion, remove the user entry
          if (currentSet.size === 0) {
            clipsToDeleteQueue.delete(accountId)
          }
        }
      } catch (error) {
        logger.error('[GSI_ClipDelete] Error processing deletion batch for user', {
          ...logContext,
          error: (error as Error).message,
        })
        // Keep slugs in the queue for retry on next interval
      }
    }

    isProcessingDeleteQueue = false
    logger.info('[GSI_ClipDelete] Finished clip deletion queue processing.')
  }
}

export default GSIServer
