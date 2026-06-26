import { logger } from '@dotabod/shared-utils'

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

/**
 * True when `e` looks like a transient connection/stream error worth retrying,
 * as opposed to an HTTP 4xx/5xx application error — those must surface so the
 * caller's existing handling (auth refresh, "channel points not enabled",
 * "already resolved", …) still runs.
 */
export function isTransientNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as {
    code?: unknown
    cause?: { code?: unknown }
    message?: unknown
  }
  // node-fetch sets the same string on `code` and `errno`, and Node's own
  // system errors put a (useless) negative number on `errno`, so `code` (with
  // a `cause.code` fallback for wrapped errors) is the only field worth reading.
  const code = err.code ?? err.cause?.code
  if (typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code)) return true
  // node-fetch wraps these as FetchError { type: 'system' } and doesn't always
  // expose a code we recognise, so fall back to matching the message text.
  const message = typeof err.message === 'string' ? err.message : ''
  return (
    message.includes('Premature close') ||
    message.includes('socket hang up') ||
    message.includes('network socket disconnected') ||
    message.includes('other side closed')
  )
}

interface RetryOptions {
  /** Extra attempts after the first (default 2 → up to 3 calls total). */
  retries?: number
  /** Base backoff in ms; doubles each attempt (default 250 → 250ms, then 500ms). */
  baseDelayMs?: number
  /** Short label for the retry log line, e.g. `closeTwitchBet:getPredictions`. */
  label?: string
}

/**
 * Run `fn`, retrying only on transient network errors (see
 * {@link isTransientNetworkError}) with exponential backoff. Non-transient
 * errors are rethrown immediately, and once the retries are exhausted the last
 * error is rethrown too — so this never swallows a failure, it just gives a
 * connection blip a couple of fast retries before giving up.
 *
 * Only wrap reads and *idempotent* writes (getPredictions, resolve/cancel a
 * known prediction id). Never wrap a non-idempotent create like
 * `createPrediction`: a premature-close can arrive after Twitch already created
 * the prediction, so a retry would double-create it (see the single-replica
 * note in CLAUDE.md).
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 250, label }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= retries || !isTransientNetworkError(e)) throw e
      const delayMs = baseDelayMs * 2 ** attempt
      logger.info('[TWITCH] Retrying after transient network error', {
        label,
        attempt: attempt + 1,
        retries,
        delayMs,
        code: (e as { code?: unknown }).code,
      })
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
