import { setTimeout as wait } from 'node:timers/promises'

import { logger } from '@dotabod/shared-utils'
import { z } from 'zod'

/**
 * Node / undici / node-fetch error codes for *connection-level* failures that
 * are safe to retry: the request never completed because the socket dropped,
 * timed out, or the (gzip) response body closed before it was fully read.
 *
 * `ERR_STREAM_PREMATURE_CLOSE` is the one Twitch's Helix API throws most often
 * under load — it surfaced as repeated `[BETS] Could not get predictions`
 * errors that left predictions stuck open. @twurple/api already retries the
 * request leg, but it reads the (gzipped) response body *after* its internal
 * retry block, so a premature-close thrown during that body read escapes
 * twurple's retry and reaches us — that's the gap this wrapper closes.
 */
const TRANSIENT_NETWORK_CODES = new Set<string>([
  'ERR_STREAM_PREMATURE_CLOSE',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

interface NetworkErrorDetails {
  cause?: { code?: string }
  code?: string
  message: string
}

export type NetworkErrorInput = Error | null | string | undefined

const networkErrorSchema = z.object({
  cause: z.object({ code: z.string().optional() }).optional(),
  code: z.string().optional(),
  message: z.string(),
})

const isParsedTransientNetworkError = function isParsedTransientNetworkError(
  error: NetworkErrorDetails
): boolean {
  const code = error.code ?? error.cause?.code
  if (code !== undefined && TRANSIENT_NETWORK_CODES.has(code)) {
    return true
  }
  return (
    error.message.includes('Premature close') ||
    error.message.includes('socket hang up') ||
    error.message.includes('network socket disconnected') ||
    error.message.includes('other side closed')
  )
}

export const isTransientNetworkError = function isTransientNetworkError(
  error: NetworkErrorInput
): boolean {
  const parsedError = networkErrorSchema.safeParse(error)
  if (!parsedError.success) {
    return false
  }
  return isParsedTransientNetworkError(parsedError.data)
}

interface RetryOptions {
  /** Extra attempts after the first (default 2 → up to 3 calls total). */
  retries?: number
  /** Base backoff in ms; doubles each attempt (default 250 → 250ms, then 500ms). */
  baseDelayMs?: number
  /** Short label for the retry log line, e.g. `closeTwitchBet:getPredictions`. */
  label?: string
}

interface RequiredRetryOptions {
  baseDelayMs: number
  label?: string
  retries: number
}

const retryTransientAttempt = async function retryTransientAttempt<T>(
  fn: () => Promise<T>,
  options: RequiredRetryOptions,
  attempt: number
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const parsedError = networkErrorSchema.safeParse(error)
    if (
      attempt >= options.retries ||
      !parsedError.success ||
      !isParsedTransientNetworkError(parsedError.data)
    ) {
      throw error
    }

    const delayMs = options.baseDelayMs * 2 ** attempt
    logger.info('[TWITCH] Retrying after transient network error', {
      attempt: attempt + 1,
      code: parsedError.data.code,
      delayMs,
      label: options.label,
      retries: options.retries,
    })
    if (delayMs > 0) {
      await wait(delayMs)
    }
    return await retryTransientAttempt(fn, options, attempt + 1)
  }
}

export const retryTransient = async function retryTransient<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 250, label }: RetryOptions = {}
): Promise<T> {
  return await retryTransientAttempt(fn, { baseDelayMs, label, retries }, 0)
}
