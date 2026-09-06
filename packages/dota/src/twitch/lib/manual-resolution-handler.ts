import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { z } from 'zod'

import { redisClient } from '../../db/redis-instance'
import { gsiHandlers } from '../../dota/lib/consts'
import { chatClient } from '../chat-client'
import type { MessageType } from './command-handler'
import { getSteamMatchDetails } from './get-steam-match-details'
import { resolveByMostRecentMatch, resolveMatchRetroactively } from './resolve-match'

type ResolutionOutcome = 'lost' | 'won'
type Team = 'dire' | 'radiant'

const MANUAL_RESOLUTION_ERROR_KEY = 'bets.manualResolutionError'
const PENDING_RESOLUTION_SUFFIX = 'pendingManualResolution'
const PLAYING_TEAM_SUFFIX = 'playingTeam'

const matchIdSchema = z.string().regex(/^\d+$/u)
const pendingResolutionSchema = z.object({ matchId: z.string().min(1) })
const teamSchema = z.enum(['dire', 'radiant'])

const sayManualResolutionError = function sayManualResolutionError(message: MessageType): void {
  chatClient.say(
    message.channel.name,
    t(MANUAL_RESOLUTION_ERROR_KEY, {
      emote: 'PauseChamp',
      lng: message.channel.client.locale,
    }),
    message.user.messageId
  )
}

const handleRetroactiveResolution = async function handleRetroactiveResolution(
  message: MessageType,
  matchIdArgument: string,
  didWin: boolean
): Promise<void> {
  const { client, name: channel } = message.channel
  const parsedMatchId = matchIdSchema.safeParse(matchIdArgument)
  if (!parsedMatchId.success) {
    chatClient.say(
      channel,
      t('bets.retroactiveMatchNotFound', {
        emote: 'PauseChamp',
        lng: client.locale,
        matchId: matchIdArgument,
      }),
      message.user.messageId
    )
    return
  }

  await resolveMatchRetroactively(
    client,
    parsedMatchId.data,
    didWin,
    message.user.name,
    channel,
    message.user.messageId
  )
}

const getPendingMatchId = function getPendingMatchId(serializedResolution: string): string {
  return pendingResolutionSchema.parse(JSON.parse(serializedResolution)).matchId
}

const getWinningTeam = function getWinningTeam(myTeam: Team, didWin: boolean): Team {
  if (didWin) {
    return myTeam
  }
  return myTeam === 'radiant' ? 'dire' : 'radiant'
}

const getOptionalMatchDetails = async function getOptionalMatchDetails(
  matchId: string
): Promise<Awaited<ReturnType<typeof getSteamMatchDetails>> | undefined> {
  try {
    return await getSteamMatchDetails(matchId)
  } catch (error) {
    logger.info('[BETS] Could not get match details for manual resolution, proceeding anyway', {
      error,
      matchId,
    })
    return undefined
  }
}

const resolveWithoutPendingMatch = async function resolveWithoutPendingMatch(
  message: MessageType,
  didWin: boolean
): Promise<void> {
  const { client, name: channel } = message.channel
  const flipped = await resolveByMostRecentMatch(
    client,
    didWin,
    message.user.name,
    channel,
    message.user.messageId
  )
  if (flipped) {
    return
  }

  chatClient.say(
    channel,
    t('bets.noPendingResolution', {
      emote: 'PauseChamp',
      lng: client.locale,
    }),
    message.user.messageId
  )
}

const resolvePendingMatch = async function resolvePendingMatch(
  message: MessageType,
  serializedResolution: string,
  outcome: ResolutionOutcome
): Promise<void> {
  const { client, name: channel } = message.channel
  const matchId = getPendingMatchId(serializedResolution)

  logger.info(`[BETS] Manual resolution requested - ${outcome}`, {
    matchId,
    name: client.name,
    resolvedBy: message.user.name,
  })

  const parsedTeam = teamSchema.safeParse(
    await redisClient.client.get(`${client.token}:${PLAYING_TEAM_SUFFIX}`)
  )
  if (!parsedTeam.success) {
    logger.error('[BETS] Could not determine team for manual resolution', {
      matchId,
      name: client.name,
    })
    sayManualResolutionError(message)
    return
  }

  const gcData = await getOptionalMatchDetails(matchId)
  await redisClient.client.del(`${client.token}:${PENDING_RESOLUTION_SUFFIX}`)

  const handler = gsiHandlers.get(client.token)
  if (!handler) {
    logger.error('[BETS] Could not find GSI handler for manual resolution', {
      matchId,
      name: client.name,
    })
    sayManualResolutionError(message)
    return
  }

  const didWin = outcome === 'won'
  await handler.closeBets(getWinningTeam(parsedTeam.data, didWin), gcData)
  chatClient.say(
    channel,
    t('bets.manualResolutionSuccess', {
      context: outcome,
      lng: client.locale,
      matchId,
      username: message.user.name,
    }),
    message.user.messageId
  )
}

export const handleManualResolution = async function handleManualResolution(
  message: MessageType,
  args: string[],
  outcome: ResolutionOutcome
): Promise<void> {
  const matchIdArgument = args[0]?.trim()
  const didWin = outcome === 'won'
  if (matchIdArgument !== undefined && matchIdArgument.length > 0) {
    await handleRetroactiveResolution(message, matchIdArgument, didWin)
    return
  }

  const { client } = message.channel
  try {
    const pendingResolution = await redisClient.client.get(
      `${client.token}:${PENDING_RESOLUTION_SUFFIX}`
    )
    if (pendingResolution === null || pendingResolution.length === 0) {
      await resolveWithoutPendingMatch(message, didWin)
      return
    }
    await resolvePendingMatch(message, pendingResolution, outcome)
  } catch (error) {
    logger.error(`[BETS] Error in manual resolution command (${outcome})`, {
      channel: message.channel.name,
      error,
    })
    sayManualResolutionError(message)
  }
}
