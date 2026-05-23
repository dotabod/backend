import { randomUUID } from 'node:crypto'
import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { redisClient } from '../../db/redisInstance'
import { type CreateReadyClipOptions, createReadyClip } from './createReadyClip'
import { delayedQueue } from './DelayedQueue'

// Heroes stay on the HUD all game, so retry generously with no deadline.
export const GAMEPLAY_CLIP_OPTS: CreateReadyClipOptions = {
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
export const DRAFT_CLIP_OPTS: CreateReadyClipOptions = {
  maxAttempts: 2,
  pollAttempts: 5,
  pollIntervalMs: 5000,
  deadlineMs: 45000,
}

export interface ClipTaskPayload {
  accountId: string
  matchId: string | undefined
  detectPath: 'detect' | 'detect_draft' | 'detect_in_game'
  opts: CreateReadyClipOptions
  logPrefix: string
  logContext: Record<string, unknown>
}

// Stored member shape: the payload plus a unique id (so identical payloads don't
// collide in the sorted set) and the absolute fire time.
interface ClipScheduleMember extends ClipTaskPayload {
  id: string
  executeAt: number
}

// Sorted set of pending clip tasks, scored by executeAt. The in-process
// DelayedQueue is the fast path; this set is the durable backup so a deploy/
// restart inside the 46-60s clip delay window doesn't silently drop the
// (name-bearing) strategy clip. Single-replica service, so one consumer.
const CLIP_SCHEDULE_KEY = 'dota:clip-schedule'

// On startup a task whose fire time already passed is still worth running if the
// loadout / top-bar UI it targets is plausibly still on screen and Twitch's
// createAfterDelay buffer still covers it. Past this, a late clip would capture
// gameplay instead of the intended screen, so we drop it.
const MAX_LATE_MS = 90_000

// External effects are injected so the scheduling/re-arm logic is testable
// offline without process-wide module mocks (which would leak into sibling
// test files). `realDeps()` wires the production singletons.
export interface ClipScheduleDeps {
  zAdd: (member: string, score: number) => Promise<unknown>
  zRem: (member: string) => Promise<number>
  zRangeAll: () => Promise<string[]>
  arm: (delayMs: number, cb: () => void | Promise<void>) => void
  run: (payload: ClipTaskPayload) => Promise<void>
  now: () => number
  logger: Pick<typeof logger, 'info' | 'error'>
}

async function createAndSubmitClip(payload: ClipTaskPayload): Promise<void> {
  const { accountId, matchId, detectPath, opts, logPrefix, logContext } = payload
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

function realDeps(): ClipScheduleDeps {
  return {
    zAdd: (member, score) => redisClient.client.zAdd(CLIP_SCHEDULE_KEY, { score, value: member }),
    zRem: (member) => redisClient.client.zRem(CLIP_SCHEDULE_KEY, member),
    zRangeAll: () => redisClient.client.zRangeByScore(CLIP_SCHEDULE_KEY, '-inf', '+inf'),
    arm: (delayMs, cb) => {
      delayedQueue.addTask(delayMs, cb)
    },
    run: createAndSubmitClip,
    now: Date.now,
    logger,
  }
}

// Remove the member first so this task can only run once across the in-process
// timer and any startup re-arm. If Redis errors we proceed anyway — capturing a
// (possibly duplicate) clip beats dropping the one chance to read the roster.
async function fireClip(deps: ClipScheduleDeps, member: string): Promise<void> {
  let parsed: ClipScheduleMember
  try {
    parsed = JSON.parse(member) as ClipScheduleMember
  } catch {
    deps.logger.error('[ClipSchedule] Could not parse scheduled clip member', { member })
    return
  }

  let removed = 1
  try {
    removed = await deps.zRem(member)
  } catch (error) {
    deps.logger.error('[ClipSchedule] zRem failed; running clip task anyway', {
      ...parsed.logContext,
      error: (error as Error).message,
    })
  }
  if (!removed) return

  await deps.run(parsed)
}

export async function scheduleClipWith(
  deps: ClipScheduleDeps,
  delayMs: number,
  payload: ClipTaskPayload,
): Promise<void> {
  const executeAt = deps.now() + Math.max(0, delayMs)
  const member = JSON.stringify({ id: randomUUID(), executeAt, ...payload } as ClipScheduleMember)

  try {
    await deps.zAdd(member, executeAt)
  } catch (error) {
    // Persistence is best-effort; the in-process timer below still fires.
    deps.logger.error('[ClipSchedule] Failed to persist scheduled clip', {
      ...payload.logContext,
      error: (error as Error).message,
    })
  }

  deps.arm(delayMs, () => fireClip(deps, member))
}

export async function rearmWith(deps: ClipScheduleDeps): Promise<void> {
  let members: string[]
  try {
    members = await deps.zRangeAll()
  } catch (error) {
    deps.logger.error('[ClipSchedule] Failed to read persisted clips on startup', {
      error: (error as Error).message,
    })
    return
  }

  const now = deps.now()
  let rearmed = 0
  let dropped = 0

  for (const member of members) {
    let parsed: ClipScheduleMember
    try {
      parsed = JSON.parse(member) as ClipScheduleMember
    } catch {
      await deps.zRem(member).catch(() => undefined)
      dropped++
      continue
    }

    const lateBy = now - parsed.executeAt
    if (lateBy > MAX_LATE_MS) {
      await deps.zRem(member).catch(() => undefined)
      dropped++
      continue
    }

    const delayMs = lateBy <= 0 ? parsed.executeAt - now : 0
    deps.arm(delayMs, () => fireClip(deps, member))
    rearmed++
  }

  if (rearmed || dropped) {
    deps.logger.info('[ClipSchedule] Re-armed persisted clip tasks after startup', {
      rearmed,
      dropped,
    })
  }
}

// Persist the task in Redis and arm the in-process timer. The handler can
// fire-and-forget this; Redis is the durability backstop, the DelayedQueue is
// the normal fire path.
export function scheduleClip(delayMs: number, payload: ClipTaskPayload): Promise<void> {
  return scheduleClipWith(realDeps(), delayMs, payload)
}

// Re-arm clip tasks that outlived a restart. Future tasks keep their original
// fire time; recently-passed tasks fire ~immediately; stale ones are dropped.
export function rearmPersistedClips(): Promise<void> {
  return rearmWith(realDeps())
}
