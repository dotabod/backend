import { logger } from '@dotabod/shared-utils'
import type { ApiClient } from '@twurple/api'

export interface CreateReadyClipOptions {
  // How many fresh clips to create before giving up.
  maxAttempts: number
  // Per clip, how many times to poll for transcode completion.
  pollAttempts: number
  pollIntervalMs: number
  // Optional wall-clock budget across all attempts (keeps draft retries
  // inside the draft screen window). Unset = no deadline.
  deadlineMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Twitch responds 404 with body like {"status":404,"message":"Channel offline."}
// when CreateClip is called against an offline broadcaster. The bot can't recover
// from that — retrying won't bring the stream online inside the budget — so we
// short-circuit instead of burning the remaining attempts (and erroring 3x).
function isChannelOfflineError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { statusCode?: unknown; body?: unknown; message?: unknown }
  if (e.statusCode !== 404) return false
  const body = typeof e.body === 'string' ? e.body : ''
  const message = typeof e.message === 'string' ? e.message : ''
  return (
    /channel offline|stream not live/i.test(body) ||
    /channel offline|stream not live/i.test(message)
  )
}

// Twurple's AuthProvider throws when the broadcaster's token is missing the
// clips:edit scope: "...does not have any of the requested scopes (clips:edit)
// and can not be upgraded." That's a permanent per-user auth state — the streamer
// has to re-authorize — so retrying inside the loop can't recover it and just
// re-logs the same error 2-3x per game state. Short-circuit like the offline case.
function isMissingScopeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const message =
    typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : ''
  return /requested scopes|can not be upgraded/i.test(message)
}

// Twitch's CreateClip API is asynchronous and silently fails to actually produce
// a clip a large fraction of the time: it returns a clip ID, but the clip never
// transcodes (duration stays 0, renditions 404) — permanently, not just briefly.
// Re-polling that dead ID can't recover it, so when a clip never transcodes we
// create a brand-new clip and try again. The 10 hero portraits sit in the top HUD
// for the whole match, so a later gameplay clip is still fine for hero detection.
export async function createReadyClip(
  api: ApiClient,
  accountId: string,
  opts: CreateReadyClipOptions,
  logPrefix: string,
  logContext: Record<string, unknown>,
): Promise<string | null> {
  const start = Date.now()
  const overDeadline = () => opts.deadlineMs !== undefined && Date.now() - start > opts.deadlineMs

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (overDeadline()) break

    let clipId: string
    try {
      clipId = await api.clips.createClip({
        createAfterDelay: true,
        channel: accountId,
      })
    } catch (error) {
      if (isChannelOfflineError(error)) {
        logger.info(`${logPrefix} createClip skipped — channel offline`, {
          ...logContext,
          attempt,
        })
        return null
      }
      if (isMissingScopeError(error)) {
        logger.warn(`${logPrefix} createClip skipped — token missing clips:edit scope`, {
          ...logContext,
          attempt,
        })
        return null
      }
      logger.error(`${logPrefix} createClip failed`, {
        ...logContext,
        attempt,
        error: (error as Error).message,
      })
      continue
    }

    logger.info(`${logPrefix} clip created`, { ...logContext, clipId, attempt })

    for (let poll = 1; poll <= opts.pollAttempts; poll++) {
      if (overDeadline()) return null
      try {
        const clip = await api.clips.getClipById(clipId)
        if (clip && clip.duration > 0) {
          logger.info(`${logPrefix} clip ready`, { ...logContext, clipId, attempt })
          return clipId
        }
      } catch (error) {
        logger.warn(`${logPrefix} Error checking clip readiness`, {
          ...logContext,
          clipId,
          attempt,
          poll,
          error: (error as Error).message,
        })
      }
      if (poll < opts.pollAttempts) await sleep(opts.pollIntervalMs)
    }

    logger.warn(`${logPrefix} clip did not transcode; recreating`, {
      ...logContext,
      clipId,
      attempt,
    })
  }

  return null
}
