import { randomUUID } from 'node:crypto'

import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

import { redisClient } from '../../db/redis-instance'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import { is8500Plus } from '../../utils/index'
import { getStreamDelay } from '../get-stream-delay'
import { GLOBAL_DELAY } from './consts'
import { createReadyClip } from './create-ready-clip'
import type { ClipLogContext, CreateReadyClipOptions } from './create-ready-clip'
import { delayedQueue } from './delayed-queue'
import { isPlayingMatch } from './is-playing-match'
import { MatchIdMemory } from './match-id-memory'

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
const GAMEPLAY_CLIP_OPTS: CreateReadyClipOptions = {
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
const DRAFT_CLIP_OPTS: CreateReadyClipOptions = {
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

interface ClipPhase {
  delayMs: number
  detectPath: ClipTaskPayload['detectPath']
  logPrefix: string
  opts: CreateReadyClipOptions
}

const clipPhases = new Map<string, ClipPhase>([
  [
    'DOTA_GAMERULES_STATE_PLAYER_DRAFT',
    {
      delayMs: 46_000,
      detectPath: 'detect_draft',
      logPrefix: '[Draft Clip]',
      opts: DRAFT_CLIP_OPTS,
    },
  ],
  [
    'DOTA_GAMERULES_STATE_STRATEGY_TIME',
    {
      // The roster panel is visible for ~30s and Twitch's clip ends at createClip.
      // In six Topson games, 50_000 put frame zero at 0:07–0:11 and missed two panels.
      // 43_750 targets ~0:15. Retune with scripts/clip-debug/scan_clip.py using
      // current delay - (15 - median countdown) * 1000.
      delayMs: 43_750,
      detectPath: 'detect',
      logPrefix: '[Clip]',
      opts: GAMEPLAY_CLIP_OPTS,
    },
  ],
  [
    'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
    {
      // The top bar stays up all game. Give players time to load before capturing it.
      delayMs: 60_000,
      detectPath: 'detect_in_game',
      logPrefix: '[In-Game Clip]',
      opts: GAMEPLAY_CLIP_OPTS,
    },
  ],
])

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

export class ClipScheduler {
  private readonly matches = {
    detect: new MatchIdMemory(),
    detect_draft: new MatchIdMemory(),
    detect_in_game: new MatchIdMemory(),
  }

  constructor(private readonly deps: ClipScheduleDeps) {}

  get matchesByPhase(): { draft: number; inGame: number } {
    return { draft: this.matches.detect_draft.size, inGame: this.matches.detect_in_game.size }
  }

  private claim({ accountId, detectPath, matchId }: ClipTaskPayload): boolean {
    if (!matchId) {
      return true
    }
    const matches = this.matches[detectPath]
    // Distinct streamers' strategy clips give Vision another view of the roster.
    const key = detectPath === 'detect' ? `${matchId}:${accountId}` : matchId
    if (matches.has(key)) {
      return false
    }
    matches.add(key)
    return true
  }

  async schedule(delayMs: number, payload: ClipTaskPayload): Promise<void> {
    if (!this.claim(payload)) {
      return
    }
    const executeAt = this.deps.now() + Math.max(0, delayMs)
    const member = JSON.stringify({ executeAt, id: randomUUID(), ...payload })
    let persisted = false
    try {
      await this.deps.zAdd(member, executeAt)
      persisted = true
    } catch (error) {
      this.deps.logger.error('[ClipSchedule] Failed to persist scheduled clip', {
        ...payload.logContext,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.arm(member, executeAt, payload, persisted)
  }

  async rearm(): Promise<void> {
    let members: string[]
    try {
      members = await this.deps.zRangeAll()
    } catch (error) {
      this.deps.logger.error('[ClipSchedule] Failed to read persisted clips on startup', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    const now = this.deps.now()
    const results = await Promise.all(
      members.map(async (member) => await this.rearmMember(member, now))
    )
    const rearmed = results.filter((result) => result === 'rearmed').length
    const dropped = results.filter((result) => result === 'dropped').length
    if (rearmed || dropped) {
      this.deps.logger.info('[ClipSchedule] Re-armed persisted clip tasks after startup', {
        dropped,
        rearmed,
      })
    }
  }

  private async rearmMember(
    member: string,
    now: number
  ): Promise<'dropped' | 'rearmed' | 'skipped'> {
    const payload = parseClipScheduleMember(member)
    if (payload === null || now - payload.executeAt > MAX_LATE_MS) {
      try {
        await this.deps.zRem(member)
      } catch (error) {
        this.deps.logger.error('[ClipSchedule] Failed to remove persisted clip', {
          error: error instanceof Error ? error.message : String(error),
          member,
        })
      }
      return 'dropped'
    }

    if (!this.claim(payload)) {
      return 'skipped'
    }
    this.arm(member, payload.executeAt, payload, true)
    return 'rearmed'
  }

  private arm(
    member: string,
    executeAt: number,
    payload: ClipTaskPayload,
    persisted: boolean
  ): void {
    this.deps.arm(Math.max(0, executeAt - this.deps.now()), async () => {
      let removed = 1
      try {
        removed = await this.deps.zRem(member)
      } catch (error) {
        // Capturing a possibly duplicate clip beats dropping the only usable roster frame.
        this.deps.logger.error('[ClipSchedule] zRem failed; running clip task anyway', {
          ...payload.logContext,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      // A failed write may leave no member to claim. The in-process timer still owns the task.
      if (removed > 0 || !persisted) {
        await this.deps.run(payload)
      }
    })
  }
}

export const clipScheduler = new ClipScheduler({
  arm: (delayMs, task) => {
    delayedQueue.addTask(delayMs, task)
  },
  logger,
  now: Date.now,
  run: createAndSubmitClip,
  zAdd: async (member, score) => {
    if (!redisClient.client.isReady) {
      throw new Error('Redis is unavailable')
    }
    return await redisClient.client.zAdd(CLIP_SCHEDULE_KEY, { score, value: member })
  },
  zRangeAll: async () => await redisClient.client.zRangeByScore(CLIP_SCHEDULE_KEY, '-inf', '+inf'),
  zRem: async (member) => {
    if (!redisClient.client.isReady) {
      throw new Error('Redis is unavailable')
    }
    return await redisClient.client.zRem(CLIP_SCHEDULE_KEY, member)
  },
})

export const scheduleVisionClip = async function scheduleVisionClip(
  client: SocketClient,
  gameState: string
): Promise<void> {
  const phase = clipPhases.get(gameState)
  if (!phase || !client.stream_online || !isPlayingMatch(client.gsi, false)) {
    return
  }
  if (phase.detectPath === 'detect_in_game' && process.env.VISION_IN_GAME_ENABLED !== 'true') {
    return
  }
  if (
    !is8500Plus(client) ||
    getValueOrDefault(DBSettings.disableAutoClipping, client.settings, client.subscription)
  ) {
    return
  }

  const matchId = client.gsi?.map?.matchid
  const logContext = { matchId, name: client.name, state: gameState }
  const accountId = client.Account?.providerAccountId
  if (!accountId) {
    logger.error(`${phase.logPrefix} No account ID found`, logContext)
    return
  }

  // GLOBAL_DELAY is latency padding for chat. The capture follows the broadcaster's delay.
  const streamDelay = getStreamDelay(client.settings, client.subscription) - GLOBAL_DELAY
  try {
    await clipScheduler.schedule(phase.delayMs + streamDelay, {
      accountId,
      detectPath: phase.detectPath,
      logContext,
      logPrefix: phase.logPrefix,
      matchId,
      opts: phase.opts,
    })
  } catch (error) {
    logger.error(`${phase.logPrefix} Failed to schedule clip`, { ...logContext, error })
  }
}
