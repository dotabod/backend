import http from 'node:http'
import cors from 'cors'
import express, {
  json,
  type Request,
  type Response,
  urlencoded,
  type ErrorRequestHandler,
} from 'express'
import bodyParserErrorHandler from 'express-body-parser-error-handler'
import { Server, type Socket } from 'socket.io'

import { logger, getTwitchAPI } from '@dotabod/shared-utils'
import getDBUser from '../db/getDBUser.js'
import supabase from '../db/supabase.js'
import { twitchEvent } from '../twitch/index.js'
import type { Ability, Item } from '../types.js'
import { initDotaPatchChecker } from './DotaPatchChecker.js'
import { emitMinimapBlockerStatus } from './GSIHandler.js'
import type { GSIServerInterface } from './GSIServerTypes.js'
import {
  TOKEN_TIMEOUT,
  checkForInactiveTokens,
  tokenLastPostTimestamps,
} from './clearCacheForUser.js'
import { newData, processChanges } from './globalEventEmitter.js'
import { gsiHandlers } from './lib/consts.js'
import { getAccountsFromMatch } from './lib/getAccountsFromMatch.js'
import { validateToken } from './validateToken.js'
import { deleteClipsBatch } from './lib/twitchUtils.js'

// --- Clip Deletion Queue ---
// Map<accountId: string, Set<clipSlug: string>>
const clipsToDeleteQueue = new Map<string, Set<string>>()
let isProcessingDeleteQueue = false // Simple lock
const CLIP_DELETE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function addClipToDeletionQueue(accountId: string, clipSlug: string): void {
  if (!clipsToDeleteQueue.has(accountId)) {
    clipsToDeleteQueue.set(accountId, new Set<string>())
  }
  clipsToDeleteQueue.get(accountId)?.add(clipSlug)
}
// --- End Clip Deletion Queue ---

function handleSocketAuth(socket: Socket, next: (err?: Error) => void) {
  const { token } = socket.handshake.auth

  getDBUser({ token })
    .then((client) => {
      if (client?.token) {
        // Successful authentication
        next()
      } else {
        socket.emit('auth_error', 'Invalid token') // Send an auth error message if needed
        socket.disconnect(true) // Disconnect the socket and prevent reconnection attempts
      }
    })
    .catch((e) => {
      logger.info('[GSI] Error checking auth', { token, e })
      socket.emit('auth_error', 'Authentication error') // Send an error message if needed
      socket.disconnect(true) // Disconnect the socket and prevent reconnection attempts
    })
}

async function handleSocketConnection(socket: Socket) {
  const { token } = socket.handshake.auth

  await socket.join(token)

  const handler = gsiHandlers.get(token)
  if (handler && !handler.disabled && handler.client.stream_online) {
    if (handler.client.gsi && handler.client.beta_tester) {
      emitMinimapBlockerStatus(handler.client)
    }
    handler.emitBadgeUpdate()
    handler.emitWLUpdate()
    handler.blockCache = null
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
      (req: Request, res: Response, next: () => void) => {
        const token = req.body?.auth?.token as string | undefined

        if (token) {
          // Update the timestamp for this token
          tokenLastPostTimestamps.set(token, Date.now())
        }

        next()
      },
      validateToken,
      processChanges('previously'),
      processChanges('added'),
      newData,
    )

    // Track resubscribe request timestamps separately from regular GSI posts
    const resubscribeRequestTimestamps = new Map<string, number>()
    const RESUBSCRIBE_CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

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

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('/tooltips/:channelId', async (req: Request, res: Response) => {
      // make sure channel id is a number
      if (!req.params.channelId.match(/^\d+$/)) {
        res.status(200).json({ status: 'ok' })
        return
      }

      const { channelId } = req.params
      const user = await getDBUser({ twitchId: channelId })
      if (!user?.gsi) {
        res.status(200).json({ status: 'ok' })
        return
      }

      const dotaClient = user.gsi
      const inv = Object.values(dotaClient?.items ?? {})
      const items: Item[] = inv.slice(0, 9)
      const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient })

      const messageToSend = {
        items: items.map((item) => item.name),
        neutral: dotaClient?.items?.neutral0?.name,
        hero: dotaClient?.hero?.id,
        abilities: dotaClient?.abilities
          ? Object.values(dotaClient?.abilities).map((ability: Ability) => ability.name)
          : [],
        heroes: matchPlayers.map((player) => player.heroid),
      }

      res.status(200).json(messageToSend)
    })

    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' })
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

    // Set up the repeating timer
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setInterval(checkForInactiveTokens, TOKEN_TIMEOUT)

    // Set up the repeating timer for cleaning up resubscribe timestamps
    setInterval(cleanupResubscribeTimestamps, RESUBSCRIBE_CLEANUP_TIMEOUT)

    // Initialize the Dota patch checker with a 5-minute check interval
    initDotaPatchChecker(5)

    // Set up repeating timer for batch clip deletion
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setInterval(this.processClipDeletionQueue, CLIP_DELETE_INTERVAL_MS)
    logger.info(`[GSI] Clip deletion interval started (${CLIP_DELETE_INTERVAL_MS}ms)`)
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
          slugsArray.forEach((slug) => currentSet.delete(slug))
          // If the set becomes empty after deletion, remove the user entry
          if (currentSet.size === 0) {
            clipsToDeleteQueue.delete(accountId)
          }
        }
      } catch (error: any) {
        logger.error('[GSI_ClipDelete] Error processing deletion batch for user', {
          ...logContext,
          error: error.message,
        })
        // Keep slugs in the queue for retry on next interval
      }
    }

    isProcessingDeleteQueue = false
    logger.info('[GSI_ClipDelete] Finished clip deletion queue processing.')
  }
}

export default GSIServer
