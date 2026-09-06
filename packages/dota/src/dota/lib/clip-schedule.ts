import { randomUUID } from 'node:crypto'

import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

import { redisClient } from '../../db/redis-instance'
import { createReadyClip } from './create-ready-clip'
import type { ClipLogContext, CreateReadyClipOptions } from './create-ready-clip'
import { delayedQueue } from './delayed-queue'

// Heroes stay on the HUD all game, so retry generously with no deadline.
// Helix reports duration > 0 from capture metadata ~10-13s before the
// renditions actually exist on the CDN, and the old schedule (polls at
// t≈0/5/10s, final sleep skipped) submitted inside that window — every
// rendition 404'd and the clip was lost. The initial delay pushes the first
// poll well past the observed failure window; submission then lands ~20s+
// after creation, which transcode lag has never been seen to outlast at this
// scale (the ~25min recovery case is covered by the vision API's retry
// sweeper instead).
// 60s (Twitch's max) rather than the 30s default: the roster panel is only up for
// ~30s, and a 30s clip aimed even slightly late misses it entirely — 9 of 11 of one
// streamer's strategy clips landed on the pick screen instead. `duration` extends
// the window backward from the same end anchor, so this costs nothing but doubles
// the room for the aim to be wrong.
export const GAMEPLAY_CLIP_OPTS: CreateReadyClipOptions = {
  durationSeconds: 60,
  initialDelayMs: 20_000,
  maxAttempts: 3,
  pollAttempts: 4,
  pollIntervalMs: 5000,
}

// The draft screen is only visible briefly, so keep the retry budget time-boxed,
// but give the FIRST clip a long enough poll window (~20s) to outlast Twitch's
// ~15s transcode. Recreating a clip restarts that transcode clock, so the old
// too-short window (2 x 4s = ~8s) abandoned every clip mid-transcode and failed
// ~100% of the time. Polling the same clip longer doesn't move its content
// (createAfterDelay captured the buffer at creation), so the draft UI is intact.
export const DRAFT_CLIP_OPTS: CreateReadyClipOptions = {
  deadlineMs: 45_000,
  maxAttempts: 2,
  pollAttempts: 5,
  pollIntervalMs: 5000,
}

const clipLogContextSchema: z.ZodType<ClipLogContext> = z.object({
  matchId: z.string().optional(),
  name: z.string(),
  state: z.string(),
})

const createReadyClipOptionsSchema: z.ZodType<CreateReadyClipOptions> = z.object({
  deadlineMs: z.number().optional(),
  durationSeconds: z.number().optional(),
  initialDelayMs: z.number().optional(),
  maxAttempts: z.number(),
  pollAttempts: z.number(),
  pollIntervalMs: z.number(),
})

const clipTaskPayloadSchema = z.object({
  accountId: z.string(),
  detectPath: z.enum(['detect', 'detect_draft', 'detect_in_game']),
  logContext: clipLogContextSchema,
  logPrefix: z.string(),
  matchId: z.string().optional(),
  opts: createReadyClipOptionsSchema,
})

export type ClipTaskPayload = z.infer<typeof clipTaskPayloadSchema>

interface ClipScheduleLogMetadata {
  clipId?: string
  dropped?: number
  error?: string
  matchId?: string
  member?: string
  name?: string
  rearmed?: number
  state?: string
}

// Stored member shape: the payload plus a unique id (so identical payloads don't
// collide in the sorted set) and the absolute fire time.
const clipScheduleMemberSchema = clipTaskPayloadSchema.extend({
  executeAt: z.number(),
  id: z.string(),
})

type ClipScheduleMember = z.infer<typeof clipScheduleMemberSchema>

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
  zAdd: (member: string, score: number) => Promise<number>
  zRem: (member: string) => Promise<number>
  zRangeAll: () => Promise<string[]>
  arm: (delayMs: number, task: () => void | Promise<void>) => void
  run: (payload: ClipTaskPayload) => Promise<void>
  now: () => number
  logger: {
    error: (message: string, meta?: ClipScheduleLogMetadata) => void
    info: (message: string, meta?: ClipScheduleLogMetadata) => void
  }
}

const parseClipScheduleMember = function parseClipScheduleMember(
  member: string
): ClipScheduleMember | null {
  try {
    const parsedJson: unknown = JSON.parse(member)
    const parsedMember = clipScheduleMemberSchema.safeParse(parsedJson)
    return parsedMember.success ? parsedMember.data : null
  } catch {
    return null
  }
}

const sendClipProcessingRequest = async function sendClipProcessingRequest({
  clipId,
  detectPath,
  logContext,
  logPrefix,
  matchId,
  visionApiHost,
}: {
  clipId: string
  detectPath: ClipTaskPayload['detectPath']
  logContext: ClipLogContext
  logPrefix: string
  matchId?: string
  visionApiHost: string
}): Promise<void> {
  try {
    await fetch(`https://${visionApiHost}/${detectPath}?clip_id=${clipId}&match_id=${matchId}`, {
      headers: {
        'X-API-Key': process.env.VISION_API_KEY ?? '',
      },
    })
  } catch (error) {
    logger.error(`${logPrefix} Error sending clip processing request`, {
      ...logContext,
      clipId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const createAndSubmitClip = async function createAndSubmitClip(
  payload: ClipTaskPayload
): Promise<void> {
  const { accountId, matchId, detectPath, opts, logPrefix, logContext } = payload
  try {
    const api = await getTwitchAPI(accountId)
    const clipId = await createReadyClip(api, accountId, opts, logPrefix, logContext)

    if (clipId === null || clipId.length === 0) {
      // Twitch's CreateClip API silently fails to transcode a large fraction of
      // the time (see createReadyClip). The feature degrades gracefully here —
      // we just skip vision submission — so this is expected flakiness, not an
      // error worth paging on.
      logger.warn(`${logPrefix} no usable clip after retries; skipping vision submission`, {
        ...logContext,
      })
      return
    }

    const visionApiHost = process.env.VISION_API_HOST
    if (visionApiHost === undefined || visionApiHost.length === 0) {
      logger.error(`${logPrefix} No VISION_API_HOST set`, logContext)
      return
    }

    void sendClipProcessingRequest({
      clipId,
      detectPath,
      logContext,
      logPrefix,
      matchId,
      visionApiHost,
    })
  } catch (clipError) {
    logger.error(`${logPrefix} Error creating clip`, {
      ...logContext,
      error: clipError instanceof Error ? clipError.message : String(clipError),
    })
  }
}

const realDeps = function realDeps(): ClipScheduleDeps {
  return {
    arm: (delayMs, task) => {
      delayedQueue.addTask(delayMs, task)
    },
    logger,
    now: Date.now,
    run: createAndSubmitClip,
    zAdd: async (member, score) =>
      await redisClient.client.zAdd(CLIP_SCHEDULE_KEY, { score, value: member }),
    zRangeAll: async () =>
      await redisClient.client.zRangeByScore(CLIP_SCHEDULE_KEY, '-inf', '+inf'),
    zRem: async (member) => await redisClient.client.zRem(CLIP_SCHEDULE_KEY, member),
  }
}

// Remove the member first so this task can only run once across the in-process
// timer and any startup re-arm. If Redis errors we proceed anyway — capturing a
// (possibly duplicate) clip beats dropping the one chance to read the roster.
const fireClip = async function fireClip(deps: ClipScheduleDeps, member: string): Promise<void> {
  const parsed = parseClipScheduleMember(member)
  if (parsed === null) {
    deps.logger.error('[ClipSchedule] Could not parse scheduled clip member', { member })
    return
  }

  let removed = 1
  try {
    removed = await deps.zRem(member)
  } catch (error) {
    deps.logger.error('[ClipSchedule] zRem failed; running clip task anyway', {
      ...parsed.logContext,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  if (!removed) {
    return
  }

  await deps.run(parsed)
}

const removeScheduledMemberSafely = async function removeScheduledMemberSafely(
  deps: ClipScheduleDeps,
  member: string
): Promise<void> {
  try {
    await deps.zRem(member)
  } catch (error) {
    deps.logger.error('[ClipSchedule] Failed to remove persisted clip', {
      error: error instanceof Error ? error.message : String(error),
      member,
    })
  }
}

type RearmResult = 'dropped' | 'rearmed'

const rearmMember = async function rearmMember(
  deps: ClipScheduleDeps,
  member: string,
  now: number
): Promise<RearmResult> {
  const parsed = parseClipScheduleMember(member)
  if (parsed === null) {
    await removeScheduledMemberSafely(deps, member)
    return 'dropped'
  }

  const lateBy = now - parsed.executeAt
  if (lateBy > MAX_LATE_MS) {
    await removeScheduledMemberSafely(deps, member)
    return 'dropped'
  }

  const delayMs = lateBy <= 0 ? parsed.executeAt - now : 0
  deps.arm(delayMs, async () => {
    await fireClip(deps, member)
  })
  return 'rearmed'
}

export const scheduleClipWith = async function scheduleClipWith(
  deps: ClipScheduleDeps,
  delayMs: number,
  payload: ClipTaskPayload
): Promise<void> {
  const executeAt = deps.now() + Math.max(0, delayMs)
  const member = JSON.stringify({ executeAt, id: randomUUID(), ...payload })

  try {
    await deps.zAdd(member, executeAt)
  } catch (error) {
    // Persistence is best-effort; the in-process timer below still fires.
    deps.logger.error('[ClipSchedule] Failed to persist scheduled clip', {
      ...payload.logContext,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  deps.arm(delayMs, async () => {
    await fireClip(deps, member)
  })
}

export const rearmWith = async function rearmWith(deps: ClipScheduleDeps): Promise<void> {
  let members: string[]
  try {
    members = await deps.zRangeAll()
  } catch (error) {
    deps.logger.error('[ClipSchedule] Failed to read persisted clips on startup', {
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  const now = deps.now()
  const results = await Promise.all(
    members.map(async (member) => await rearmMember(deps, member, now))
  )
  const rearmed = results.filter((result) => result === 'rearmed').length
  const dropped = results.length - rearmed

  if (rearmed || dropped) {
    deps.logger.info('[ClipSchedule] Re-armed persisted clip tasks after startup', {
      dropped,
      rearmed,
    })
  }
}

// Persist the task in Redis and arm the in-process timer. The handler can
// fire-and-forget this; Redis is the durability backstop, the DelayedQueue is
// the normal fire path.
export const scheduleClip = async function scheduleClip(
  delayMs: number,
  payload: ClipTaskPayload
): Promise<void> {
  await scheduleClipWith(realDeps(), delayMs, payload)
}

// Re-arm clip tasks that outlived a restart. Future tasks keep their original
// fire time; recently-passed tasks fire ~immediately; stale ones are dropped.
export const rearmPersistedClips = async function rearmPersistedClips(): Promise<void> {
  await rearmWith(realDeps())
}
