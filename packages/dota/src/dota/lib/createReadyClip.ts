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
    } catch (error: any) {
      logger.error(`${logPrefix} createClip failed`, {
        ...logContext,
        attempt,
        error: error.message,
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
      } catch (error: any) {
        logger.warn(`${logPrefix} Error checking clip readiness`, {
          ...logContext,
          clipId,
          attempt,
          poll,
          error: error.message,
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
