import { logger } from '@dotabod/shared-utils'
import type { Request, RequestHandler } from 'express'

import getDBUser from '../db/get-db-user'
import type { Packet } from '../types'
import { invalidTokens, lookingupToken, pendingCheckAuth } from './lib/consts'
import { recordGsiActivity } from './setup-signals'

export interface AuthenticatedGsiPacket extends Packet {
  auth?: {
    token?: string
  }
}

export interface ValidateTokenRequest {
  body: AuthenticatedGsiPacket
  headers: Request['headers']
  socket: {
    remoteAddress?: string
  }
}

export interface ValidateTokenResponse {
  json: (body: { error: string }) => ValidateTokenResponse
  status: (code: number) => ValidateTokenResponse
}

export type ValidateTokenNext = () => void

// Dota's GSI client never has two POSTs in flight, and its throttle and heartbeat
// timers start only once a 2xx arrives. Holding the reply to packets we discard
// slows offline streamers and dead cfg files from ~1 packet/s to one every few
// seconds. Stay under the 5s `timeout` every shipped cfg uses, or the client
// gives up on the request instead of waiting.
export const DISCARDED_REPLY_DELAY_MS = 3000

const INVALID_TOKEN_ERROR = 'Invalid token, skipping auth check'

const replyDiscarded = function replyDiscarded(res: ValidateTokenResponse, error: string): void {
  setTimeout(() => {
    res.status(200).json({ error })
  }, DISCARDED_REPLY_DELAY_MS)
}

export const validateTokenRequest = async function validateTokenRequest(
  req: ValidateTokenRequest,
  res: ValidateTokenResponse,
  next: ValidateTokenNext
): Promise<void> {
  const forwardedFor = req.headers['x-forwarded-for']
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : (forwardedFor ?? req.socket.remoteAddress)

  // Sent from dota gsi config file
  const token = req.body.auth?.token

  if (invalidTokens.has(token)) {
    replyDiscarded(res, INVALID_TOKEN_ERROR)
    return
  }

  if (token === undefined || token.length === 0) {
    logger.info('[GSI], Dropping message, no valid auth token', { forwardedIp })
    res.status(200).json({
      error: 'Invalid request! No token provided.',
    })
    return
  }

  // lookingupToken comes from the gsi handler, which could be true at the same time
  // so getDBUser was returning null, which means this was sending a new auth error and then
  // no longer doing authentications. i think adding the `lookingupToken` check here fixes that
  if (pendingCheckAuth.has(token) || lookingupToken.has(token)) {
    res.status(200).json({
      error: 'Still validating token, skipping requests until auth',
    })
    return
  }

  pendingCheckAuth.set(token, true)
  try {
    const { result: client } = await getDBUser({ ip: forwardedIp, token })
    if (client?.token !== undefined && client.token.length > 0) {
      // Record first-seen for the setup wizard's Step 2 verify-state, regardless of
      // stream state. This is the signal that the cfg file is installed and Dota 2 is
      // running. Cached + idempotent upsert under the hood.
      recordGsiActivity(client.token)

      if (!client.stream_online) {
        // Buffer offline packets separately from live state. This lets the online transition
        // recover immediately without exposing the previous match through chat or tooltips.
        client.pendingGsi = req.body
        client.pendingGsiUpdatedAt = Date.now()
        replyDiscarded(res, 'Stream offline')
        return
      }

      client.gsi = req.body
      client.gsiUpdatedAt = Date.now()
      client.pendingGsi = undefined
      client.pendingGsiUpdatedAt = undefined
      next()
      return
    }

    invalidTokens.add(token)
    replyDiscarded(res, INVALID_TOKEN_ERROR)
  } catch (error) {
    logger.info('[GSI] io.use Error checking auth 48', { error, token })
    invalidTokens.add(token)
    replyDiscarded(res, INVALID_TOKEN_ERROR)
  } finally {
    pendingCheckAuth.delete(token)
  }
}

export const validateToken: RequestHandler<
  Record<string, string>,
  { error: string },
  AuthenticatedGsiPacket
> = async (req, res, next) => {
  await validateTokenRequest(req, res, next)
}
