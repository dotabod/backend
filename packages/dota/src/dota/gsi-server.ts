import http from 'node:http'

import { getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import cors from 'cors'
import express, { json, urlencoded } from 'express'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { Server } from 'socket.io'
import type { DefaultEventsMap, Socket } from 'socket.io'
import { z } from 'zod'

import getDBUser from '../db/get-db-user'
import { getWL } from '../db/get-wl'
import { MAX_WL_STATS_DAYS, normalizeStatsStartDate } from '../db/win-loss-window'
import { twitchEvent } from '../twitch/index'
import type { Abilities, Items, SocketClient } from '../types'
import { getDiagnosticPayload } from './diagnostic-payload'
import { initDotaPatchChecker } from './dota-patch-checker'
import {
  newData,
  processChanges,
  processUnmarkedKillListChanges,
  recoverMultiAccount,
} from './global-event-emitter'
import { emitMinimapBlockerStatus } from './gsi-handler'
import type { GSIServerInterface } from './gsi-server-types'
import { gsiHandlers } from './lib/consts'
import { isGsiFresh } from './lib/get-current-match-id'
import { MatchDataService } from './lib/matchData'
import { remindUnresolvedMatches } from './lib/remind-unresolved-matches'
import { deleteClipsBatch } from './lib/twitch-utils'
import { recordOverlaySocketActivity } from './setup-signals'
import { validateToken } from './validate-token'
import {
  getWinLossRoom,
  WIN_LOSS_PREVIEW_CLIENT_TYPE,
  WIN_LOSS_PROFILE_CLIENT_TYPE,
} from './win-loss-socket'

// --- Clip Deletion Queue ---
// Map<accountId: string, Set<clipSlug: string>>
const clipsToDeleteQueue = new Map<string, Set<string>>()
// Simple lock
let isProcessingDeleteQueue = false
// 5 minutes
const _CLIP_DELETE_INTERVAL_MS = 5 * 60 * 1000
const STALE_OVERLAY_CHECK_INTERVAL_MS = 15_000
// --- End Clip Deletion Queue ---

interface SocketAuth {
  client?: string
  token?: string
  twitchId?: string
}

interface WinLossRequestEnvelope {
  statsDays?: unknown
  statsStartDate?: unknown
}

interface ParsedWinLossRequest {
  hasStatsDaysOverride: boolean
  hasStatsStartDateOverride: boolean
  statsDaysOverride?: number | null
  statsStartDateOverride?: string | null
}

type InventoryKey =
  | 'slot0'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'

type WinLossResult = Awaited<ReturnType<typeof getWL>>
type WinLossSocketResponse =
  | { error: string }
  | {
      records: WinLossResult['record']
      statsDays: WinLossResult['statsDays']
      statsDaysTotal: WinLossResult['statsDaysTotal']
    }

interface ClientToServerEvents {
  'diagnostic-heartbeat': () => void
  'request-wl': (
    request: WinLossRequestEnvelope | undefined,
    respond: (response: WinLossSocketResponse) => void
  ) => Promise<void>
}

interface InterServerEvents {
  connect_error: (error: Error) => void
  disconnect: (reason: string) => void
  ping: () => void
}

interface GsiSocketData {
  clientType?: string
  dotabodClient?: SocketClient
}

interface BodyParserFailure extends Error {
  status?: number
  type?: string
}

type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>

type GsiSocket = Socket<ClientToServerEvents, DefaultEventsMap, InterServerEvents, GsiSocketData>
type GsiSocketServer = Server<
  ClientToServerEvents,
  DefaultEventsMap,
  InterServerEvents,
  GsiSocketData
>

const socketAuthSchema = z.object({
  client: z.string().optional(),
  token: z.string().optional(),
  twitchId: z.string().optional(),
}) satisfies z.ZodType<SocketAuth>

const winLossRequestEnvelopeSchema = z.object({
  statsDays: z.unknown().optional(),
  statsStartDate: z.unknown().optional(),
}) satisfies z.ZodType<WinLossRequestEnvelope>
const statsDaysOverrideSchema = z.number().int().min(1).max(MAX_WL_STATS_DAYS).nullable()
const statsStartDateOverrideSchema = z
  .string()
  .nullable()
  .refine((value) => value === null || normalizeStatsStartDate(value) !== null)
const INVALID_STATS_WINDOW = 'Invalid stats window'
const bodyParserErrorSchema = z.object({
  message: z.string(),
  status: z.number(),
  type: z.enum([
    'encoding.unsupported',
    'entity.parse.failed',
    'entity.verify.failed',
    'request.aborted',
    'request.size.invalid',
    'stream.encoding.set',
    'parameters.too.many',
    'charset.unsupported',
    'entity.too.large',
  ]),
})
const resubscribeBodySchema = z.object({ token: z.string().min(1) })
const ABILITY_KEYS: (keyof Abilities)[] = [
  'ability0',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'ability5',
  'ability6',
  'ability7',
  'ability8',
  'ability9',
  'ability10',
  'ability11',
  'ability12',
  'ability13',
  'ability14',
  'ability15',
  'ability16',
  'ability17',
  'ability18',
  'ability19',
]
const INVENTORY_KEYS: InventoryKey[] = [
  'slot0',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'slot6',
  'slot7',
  'slot8',
]

const handleBodyParserError = function handleBodyParserError(
  error: BodyParserFailure,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const parsedError = bodyParserErrorSchema.safeParse(error)
  if (!parsedError.success) {
    next(error)
    return
  }
  if (!res.headersSent) {
    res.status(parsedError.data.status).send({
      message: `Body Parser failed to parse request --> ${parsedError.data.message}`,
    })
  }
}

const getAbilityNames = function getAbilityNames(abilities?: Abilities): string[] {
  if (abilities === undefined) {
    return []
  }
  const names: string[] = []
  for (const key of ABILITY_KEYS) {
    const ability = abilities[key]
    if (ability !== undefined) {
      names.push(ability.name)
    }
  }
  return names
}

const getInventoryNames = function getInventoryNames(items?: Items): string[] {
  if (items === undefined) {
    return []
  }
  const names: string[] = []
  for (const key of INVENTORY_KEYS) {
    const item = items[key]
    if (item !== undefined) {
      names.push(item.name)
    }
  }
  return names
}

const runAsyncRoute = async function runAsyncRoute(
  handler: AsyncRouteHandler,
  req: Request,
  res: Response,
  forwardError: NextFunction
): Promise<void> {
  try {
    await handler(req, res)
  } catch (error) {
    forwardError(error)
  }
}

const asyncRoute = function asyncRoute(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    void runAsyncRoute(handler, req, res, next)
  }
}

const emitInactiveOverlayState = function emitInactiveOverlayState(
  io: GsiSocketServer,
  token: string
) {
  io.to(token).emit('block', {
    matchId: null,
    state: 'GSI_STALE',
    team: null,
    type: null,
  })
  io.to(token).emit('notable-players', [])
}

const authenticateSocket = async function authenticateSocket(
  socket: GsiSocket,
  next: (err?: Error) => void,
  attempt = 0
): Promise<void> {
  const parsedAuth = socketAuthSchema.safeParse(socket.handshake.auth)
  if (!parsedAuth.success) {
    socket.emit('auth_error', 'Invalid token')
    socket.disconnect(true)
    return
  }

  const { client: clientType, token, twitchId } = parsedAuth.data
  const lookup =
    clientType === WIN_LOSS_PROFILE_CLIENT_TYPE && twitchId !== undefined ? { twitchId } : { token }

  try {
    const { reason, result: client } = await getDBUser(lookup)
    if (client?.token !== undefined && client.token.length > 0) {
      socket.data.clientType = clientType
      socket.data.dotabodClient = client
      next()
      return
    }

    if (reason === 'Token is currently being looked up' && attempt < 20) {
      setTimeout(() => {
        void authenticateSocket(socket, next, attempt + 1)
      }, 100)
      return
    }

    socket.emit('auth_error', 'Invalid token')
    socket.disconnect(true)
  } catch (error) {
    logger.info('[GSI] Error checking auth', { error, token, twitchId })
    socket.emit('auth_error', 'Authentication error')
    socket.disconnect(true)
  }
}

const handleSocketAuth = function handleSocketAuth(socket: GsiSocket, next: (err?: Error) => void) {
  void authenticateSocket(socket, next)
}

const parseWinLossRequest = function parseWinLossRequest(
  request: WinLossRequestEnvelope | undefined
): ParsedWinLossRequest | { error: string } {
  const parsedEnvelope = winLossRequestEnvelopeSchema.safeParse(request ?? {})
  if (!parsedEnvelope.success) {
    return { error: INVALID_STATS_WINDOW }
  }

  const hasStatsDaysOverride = Object.hasOwn(parsedEnvelope.data, 'statsDays')
  const hasStatsStartDateOverride = Object.hasOwn(parsedEnvelope.data, 'statsStartDate')
  const parsedStatsDays = statsDaysOverrideSchema.safeParse(parsedEnvelope.data.statsDays)
  if (hasStatsDaysOverride && !parsedStatsDays.success) {
    return { error: INVALID_STATS_WINDOW }
  }
  const parsedStatsStartDate = statsStartDateOverrideSchema.safeParse(
    parsedEnvelope.data.statsStartDate
  )
  if (hasStatsStartDateOverride && !parsedStatsStartDate.success) {
    return { error: 'Invalid stats start date' }
  }

  const parsedRequest: ParsedWinLossRequest = {
    hasStatsDaysOverride,
    hasStatsStartDateOverride,
  }
  if (hasStatsDaysOverride && parsedStatsDays.success) {
    parsedRequest.statsDaysOverride = parsedStatsDays.data
  }
  if (hasStatsStartDateOverride && parsedStatsStartDate.success) {
    parsedRequest.statsStartDateOverride = parsedStatsStartDate.data
  }
  return parsedRequest
}

const handleWinLossRequest = async function handleWinLossRequest(
  request: WinLossRequestEnvelope | undefined,
  respond: (response: WinLossSocketResponse) => void,
  client: SocketClient,
  twitchId: string,
  isWinLossPreview: boolean
): Promise<void> {
  const parsedRequest = parseWinLossRequest(request)
  if ('error' in parsedRequest) {
    respond(parsedRequest)
    return
  }
  const { hasStatsDaysOverride, hasStatsStartDateOverride } = parsedRequest
  const hasOverride = hasStatsDaysOverride || hasStatsStartDateOverride
  if (hasOverride && !isWinLossPreview) {
    respond({ error: 'Stats window overrides are only available in settings' })
    return
  }

  try {
    const wlOptions: Parameters<typeof getWL>[0] = {
      channelId: twitchId,
      lng: client.locale,
      mmrEnabled: false,
      settings: client.settings,
      streamStartDate: client.stream_start_date,
      subscription: client.subscription,
      userId: client.token,
    }
    if (hasStatsDaysOverride) {
      wlOptions.statsDaysOverride = parsedRequest.statsDaysOverride
    }
    if (hasStatsStartDateOverride) {
      wlOptions.statsStartDateOverride = parsedRequest.statsStartDateOverride
    }
    const result = await getWL(wlOptions)
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
}

const handleWinLossSocketConnection = async function handleWinLossSocketConnection(
  socket: GsiSocket,
  client: SocketClient,
  twitchId: string,
  isWinLossPreview: boolean
): Promise<void> {
  await socket.join(getWinLossRoom(twitchId))
  socket.on('request-wl', async (request, respond) => {
    await handleWinLossRequest(request, respond, client, twitchId, isWinLossPreview)
  })
}

const handleOverlaySocketConnection = async function handleOverlaySocketConnection(
  socket: GsiSocket,
  token: string
): Promise<void> {
  await socket.join(token)

  // Signal that this user's overlay browser source has connected at least once.
  // Drives the setup wizard's Step 3 verify-state. Cached + idempotent.
  recordOverlaySocketActivity(token)
  socket.on('diagnostic-heartbeat', () => {
    recordOverlaySocketActivity(token)
  })

  const handler = gsiHandlers.get(token)
  if (handler && !handler.disabled && handler.client.stream_online) {
    if (handler.client.gsi && handler.client.beta_tester) {
      emitMinimapBlockerStatus(handler.client)
    }
    handler.emitBadgeUpdate()
    handler.emitWLUpdate()
    handler.blockCache = null
    if (isGsiFresh(handler.client)) {
      await handler.setupOBSBlockers(handler.client.gsi?.map?.game_state ?? '')
    } else {
      socket.emit('block', {
        matchId: null,
        state: 'GSI_STALE',
        team: null,
        type: null,
      })
      socket.emit('notable-players', [])
    }
  }
}

const handleSocketConnection = async function handleSocketConnection(socket: GsiSocket) {
  const parsedAuth = socketAuthSchema.safeParse(socket.handshake.auth)
  if (!parsedAuth.success) {
    return
  }
  const token = parsedAuth.data.token ?? ''
  const { clientType, dotabodClient } = socket.data ?? {}
  const client = dotabodClient ?? gsiHandlers.get(token)?.client
  if (clientType === 'setup-diagnostic') {
    socket.to(token).emit('diagnostic-overlay-probe')
    socket.emit('diagnostic-ready', { status: 'ok' })
    return
  }

  const isWinLossPreview = clientType === WIN_LOSS_PREVIEW_CLIENT_TYPE
  const isWinLossProfile = clientType === WIN_LOSS_PROFILE_CLIENT_TYPE
  const twitchId = client?.Account?.providerAccountId
  const hasWinLossIdentity = client !== undefined && twitchId !== undefined && twitchId.length > 0
  if ((isWinLossPreview || isWinLossProfile) && hasWinLossIdentity) {
    await handleWinLossSocketConnection(socket, client, twitchId, isWinLossPreview)
    return
  }

  await handleOverlaySocketConnection(socket, token)
}

const removeDeletedClips = function removeDeletedClips(accountId: string, slugs: string[]) {
  const currentSet = clipsToDeleteQueue.get(accountId)
  if (currentSet === undefined) {
    return
  }
  for (const slug of slugs) {
    currentSet.delete(slug)
  }
  if (currentSet.size === 0) {
    clipsToDeleteQueue.delete(accountId)
  }
}

const processClipDeletionForAccount = async function processClipDeletionForAccount(
  accountId: string
): Promise<void> {
  const slugsToDelete = clipsToDeleteQueue.get(accountId)
  if (slugsToDelete === undefined || slugsToDelete.size === 0) {
    clipsToDeleteQueue.delete(accountId)
    return
  }

  const slugs = [...slugsToDelete]
  const logContext = { accountId, clipCount: slugs.length }
  try {
    const apiClient = await getTwitchAPI(accountId)
    const tokenInfo = await apiClient._authProvider.getAccessTokenForUser(accountId)
    if (tokenInfo?.accessToken === undefined || tokenInfo.accessToken.length === 0) {
      logger.error('[GSI_ClipDelete] Could not get auth token for user', logContext)
      return
    }

    await deleteClipsBatch(slugs, tokenInfo.accessToken, logContext)
    removeDeletedClips(accountId, slugs)
  } catch (error) {
    logger.error('[GSI_ClipDelete] Error processing deletion batch for user', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    })
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
  io: GsiSocketServer

  constructor() {
    logger.info('Starting GSI Server!')

    const app = express()
    app.disable('x-powered-by')
    const httpServer = http.createServer((request, response) => {
      app(request, response)
    })
    this.io = new Server<ClientToServerEvents, DefaultEventsMap, InterServerEvents, GsiSocketData>(
      httpServer,
      {
        cors: {
          origin: allowedOrigins,
        },
        pingInterval: 15_000,
        pingTimeout: 60_000,
      }
    )

    app.use(cors({ origin: allowedOrigins }))
    app.use(json({ limit: '1mb' }))
    app.use(urlencoded({ extended: true, limit: '1mb' }))
    app.use(handleBodyParserError)

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
      newData
    )

    // Track resubscribe request timestamps separately from regular GSI posts
    const resubscribeRequestTimestamps = new Map<string, number>()
    // 24 hours
    const RESUBSCRIBE_CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000
    // 5 minutes
    const UNRESOLVED_REMINDER_INTERVAL_MS = 5 * 60 * 1000

    // Function to clean up old resubscribe request timestamps
    const cleanupResubscribeTimestamps = function cleanupResubscribeTimestamps() {
      const now = Date.now()
      for (const [token, timestamp] of resubscribeRequestTimestamps.entries()) {
        if (now - timestamp > RESUBSCRIBE_CLEANUP_TIMEOUT) {
          resubscribeRequestTimestamps.delete(token)
        }
      }
    }

    app.post(
      '/resubscribe',
      asyncRoute(async (req, res) => {
        const parsedBody = resubscribeBodySchema.safeParse(req.body)
        if (!parsedBody.success) {
          res.status(404).json({ status: 'not found' })
          return
        }
        const { token } = parsedBody.data

        // get providerid from token
        const { data: user } = await supabase
          .from('accounts')
          .select('providerAccountId')
          .eq('userId', token)
          .single()

        if (
          user?.providerAccountId === undefined ||
          user.providerAccountId === null ||
          user.providerAccountId.length === 0
        ) {
          res.status(404).json({ status: 'not found' })
          return
        }

        // Rate limiting - prevent abuse by limiting frequency of resubscribe requests
        const lastResubscribeRequestTime = resubscribeRequestTimestamps.get(token)
        const now = Date.now()
        // 5 minute cooldown between resubscribe requests
        const cooldownPeriod = 300_000

        if (
          lastResubscribeRequestTime !== undefined &&
          lastResubscribeRequestTime !== 0 &&
          now - lastResubscribeRequestTime < cooldownPeriod
        ) {
          logger.info('[GSI] Resubscribe request rate limited', { token })
          res.status(429).json({
            retryAfter: Math.ceil((lastResubscribeRequestTime + cooldownPeriod - now) / 1000),
            status: 'too many requests',
          })
          return
        }

        // Update timestamp for rate limiting
        resubscribeRequestTimestamps.set(token, now)

        twitchEvent.emit('resubscribe', user.providerAccountId)
        res.status(200).json({ status: 'ok' })
      })
    )

    app.get(
      '/tooltips/:channelId',
      asyncRoute(async (req, res) => {
        const channelId = z.string().regex(/^\d+$/u).safeParse(req.params.channelId)
        // make sure channel id is a number
        if (!channelId.success) {
          res.status(200).json({ status: 'ok' })
          return
        }

        const { result: user } = await getDBUser({ twitchId: channelId.data })
        if (user?.stream_online !== true || !isGsiFresh(user)) {
          res.status(200).json({ status: 'ok' })
          return
        }

        const dotaClient = user.gsi
        const roster = await new MatchDataService(user).resolveRoster()

        const messageToSend = {
          abilities: getAbilityNames(dotaClient?.abilities),
          hero: dotaClient?.hero?.id,
          heroes: roster.players.map((p) => p.heroId),
          items: getInventoryNames(dotaClient?.items),
          neutral: dotaClient?.items?.neutral0?.name,
        }

        res.status(200).json(messageToSend)
      })
    )

    app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
    })

    app.get('/diagnostics/payload', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store')
      res.type('text/plain').status(200).send(getDiagnosticPayload())
    })

    httpServer.listen(5120, () => {
      logger.info(`[GSI] Dota 2 GSI listening on *:5120`)
    })

    this.io.use(handleSocketAuth)
    this.io.on('connection', (socket) => {
      void handleSocketConnection(socket)
    })
    this.io.on('connect_error', (error) => {
      logger.info('[GSI] io connect_error', { error })
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
        handler.blockCache = null
      }
    }, STALE_OVERLAY_CHECK_INTERVAL_MS)

    // Nudge mods once per unresolved match while the stream is live
    setInterval(() => {
      void (async () => {
        try {
          await remindUnresolvedMatches()
        } catch (error) {
          logger.error('[BETS] remindUnresolvedMatches failed', { error })
        }
      })()
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
  static async processClipDeletionQueue(): Promise<void> {
    if (isProcessingDeleteQueue) {
      logger.warn('[GSI_ClipDelete] Deletion processing already in progress, skipping interval.')
      return
    }
    if (clipsToDeleteQueue.size === 0) {
      // logger.debug('[GSI_ClipDelete] Queue is empty, skipping processing.'); // Optional: debug logging
      return
    }

    logger.info(
      `[GSI_ClipDelete] Starting clip deletion queue processing (${clipsToDeleteQueue.size} users)`
    )
    isProcessingDeleteQueue = true

    const accountIds = [...clipsToDeleteQueue.keys()]
    try {
      await Promise.all(accountIds.map(processClipDeletionForAccount))
    } finally {
      isProcessingDeleteQueue = false
      logger.info('[GSI_ClipDelete] Finished clip deletion queue processing.')
    }
  }
}

export default GSIServer
