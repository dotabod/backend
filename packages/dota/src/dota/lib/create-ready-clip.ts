import { setTimeout as sleep } from 'node:timers/promises'

import { logger } from '@dotabod/shared-utils'
import { z } from 'zod'

export interface ClipQuery extends Record<string, string | undefined> {
  broadcaster_id: string
  duration?: string
}

interface ClipApiRequest {
  canOverrideScopedUserContext: boolean
  method: 'POST'
  query: ClipQuery
  scopes: string[]
  type: 'helix'
  url: 'clips'
  userId: string
}

export interface ClipApiClient {
  callApi: (options: ClipApiRequest) => Promise<{ data: { id: string }[] }>
  clips: {
    getClipById: (id: string) => Promise<{ duration: number } | null>
  }
}

export interface CreateReadyClipOptions {
  maxAttempts: number
  pollAttempts: number
  pollIntervalMs: number
  initialDelayMs?: number
  deadlineMs?: number
  durationSeconds?: number
}

export interface ClipLogContext {
  matchId?: string
  name: string
  state: string
}

interface ClipLogMetadata extends ClipLogContext {
  attempt: number
  clipId?: string
  error?: string
  poll?: number
}

interface ClipLogger {
  error: (message: string, metadata: ClipLogMetadata) => void
  info: (message: string, metadata: ClipLogMetadata) => void
  warn: (message: string, metadata: ClipLogMetadata) => void
}

export interface CreateReadyClipDependencies {
  logger: ClipLogger
  wait: (milliseconds: number) => Promise<void>
}

interface ClipWorkflow {
  accountId: string
  api: ClipApiClient
  dependencies: CreateReadyClipDependencies
  logContext: ClipLogContext
  logPrefix: string
  options: CreateReadyClipOptions
  startTime: number
}

const clipErrorSchema = z.object({
  body: z.string().optional(),
  message: z.string().optional(),
  statusCode: z.number().optional(),
})
type ClipError = z.infer<typeof clipErrorSchema>

const wait = async function wait(milliseconds: number): Promise<void> {
  await sleep(milliseconds)
}

const defaultDependencies = { logger, wait } satisfies CreateReadyClipDependencies

const createClipWithDuration = async function createClipWithDuration(
  api: ClipApiClient,
  accountId: string,
  durationSeconds: number | undefined
): Promise<string> {
  const query: ClipQuery = { broadcaster_id: accountId }
  if (durationSeconds !== undefined) {
    query.duration = String(durationSeconds)
  }

  const response = await api.callApi({
    canOverrideScopedUserContext: true,
    method: 'POST',
    query,
    scopes: ['clips:edit'],
    type: 'helix',
    url: 'clips',
    userId: accountId,
  })
  const [createdClip] = response.data
  if (createdClip === undefined) {
    throw new Error('Twitch returned no clip after creating one')
  }
  return createdClip.id
}

const isChannelOfflineError = function isChannelOfflineError(error: ClipError | null): boolean {
  if (error?.statusCode !== 404) {
    return false
  }
  return /channel offline|stream not live/iu.test(`${error.body ?? ''} ${error.message ?? ''}`)
}

const isMissingScopeError = function isMissingScopeError(error: ClipError | null): boolean {
  return /requested scopes|can not be upgraded/iu.test(error?.message ?? '')
}

const isOverDeadline = function isOverDeadline(workflow: ClipWorkflow): boolean {
  const { deadlineMs } = workflow.options
  return deadlineMs !== undefined && Date.now() - workflow.startTime > deadlineMs
}

const pollClip = async function pollClip(
  workflow: ClipWorkflow,
  clipId: string,
  attempt: number,
  poll: number
): Promise<'deadline' | 'ready' | 'retry'> {
  if (isOverDeadline(workflow)) {
    return 'deadline'
  }

  try {
    const clip = await workflow.api.clips.getClipById(clipId)
    if (clip !== null && clip.duration > 0) {
      workflow.dependencies.logger.info(`${workflow.logPrefix} clip ready`, {
        ...workflow.logContext,
        attempt,
        clipId,
      })
      return 'ready'
    }
  } catch (error) {
    const parsedError = clipErrorSchema.safeParse(error)
    const clipError = parsedError.success ? parsedError.data : null
    workflow.dependencies.logger.warn(`${workflow.logPrefix} Error checking clip readiness`, {
      ...workflow.logContext,
      attempt,
      clipId,
      error: clipError?.message ?? String(error),
      poll,
    })
  }

  if (poll >= workflow.options.pollAttempts) {
    return 'retry'
  }
  await workflow.dependencies.wait(workflow.options.pollIntervalMs)
  return await pollClip(workflow, clipId, attempt, poll + 1)
}

const createReadyClipAttempt = async function createReadyClipAttempt(
  workflow: ClipWorkflow,
  attempt: number
): Promise<string | null> {
  if (attempt > workflow.options.maxAttempts || isOverDeadline(workflow)) {
    return null
  }

  let clipId: string
  try {
    clipId = await createClipWithDuration(
      workflow.api,
      workflow.accountId,
      workflow.options.durationSeconds
    )
  } catch (error) {
    const parsedError = clipErrorSchema.safeParse(error)
    const clipError = parsedError.success ? parsedError.data : null
    if (isChannelOfflineError(clipError)) {
      workflow.dependencies.logger.info(
        `${workflow.logPrefix} createClip skipped — channel offline`,
        { ...workflow.logContext, attempt }
      )
      return null
    }
    if (isMissingScopeError(clipError)) {
      workflow.dependencies.logger.warn(
        `${workflow.logPrefix} createClip skipped — token missing clips:edit scope`,
        { ...workflow.logContext, attempt }
      )
      return null
    }
    workflow.dependencies.logger.error(`${workflow.logPrefix} createClip failed`, {
      ...workflow.logContext,
      attempt,
      error: clipError?.message ?? String(error),
    })
    return await createReadyClipAttempt(workflow, attempt + 1)
  }

  workflow.dependencies.logger.info(`${workflow.logPrefix} clip created`, {
    ...workflow.logContext,
    attempt,
    clipId,
  })

  if (workflow.options.initialDelayMs !== undefined && workflow.options.initialDelayMs !== 0) {
    await workflow.dependencies.wait(workflow.options.initialDelayMs)
  }

  const pollResult = await pollClip(workflow, clipId, attempt, 1)
  if (pollResult === 'ready') {
    return clipId
  }
  if (pollResult === 'deadline') {
    return null
  }

  workflow.dependencies.logger.warn(`${workflow.logPrefix} clip did not transcode; recreating`, {
    ...workflow.logContext,
    attempt,
    clipId,
  })
  return await createReadyClipAttempt(workflow, attempt + 1)
}

export const createReadyClip = async function createReadyClip(
  api: ClipApiClient,
  accountId: string,
  options: CreateReadyClipOptions,
  logPrefix: string,
  logContext: ClipLogContext,
  dependencies: CreateReadyClipDependencies = defaultDependencies
): Promise<string | null> {
  return await createReadyClipAttempt(
    { accountId, api, dependencies, logContext, logPrefix, options, startTime: Date.now() },
    1
  )
}
