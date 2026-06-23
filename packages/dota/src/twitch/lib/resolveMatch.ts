import { getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { LOBBY_TYPE_RANKED, MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/getWL'
import { getSessionStartDate } from '../../db/streamWindow'
import { gsiHandlers } from '../../dota/lib/consts'
import { updateMmr } from '../../dota/lib/updateMmr'
import { steamSocket } from '../../steam/ws'
import type { MatchMinimalDetailsResponse, SocketClient } from '../../types'
import { chatClient } from '../chatClient'
import { retryTransient } from './retryTransient'

interface SessionMatch {
  id: string
  matchId: string
  myTeam: string
  predictionId: string | null
  steam32Id: number | null
  lobby_type: number | null
  is_party: boolean | null
  won: boolean | null
}

/**
 * Find a match (resolved or not) within the streaming session window.
 * Returns 'expired' when the row exists but predates the session, so mods
 * can be told why a correction was refused.
 */
async function findSessionMatch(
  userId: string,
  matchId: string,
  streamStartDate?: Date | null,
): Promise<{ match: SessionMatch | null; error: string | null }> {
  const startDate = getSessionStartDate(streamStartDate)

  const { data: match } = await supabase
    .from('matches')
    .select('id, matchId, myTeam, predictionId, steam32Id, lobby_type, is_party, won')
    .eq('matchId', matchId)
    .eq('userId', userId)
    .gte('created_at', startDate.toISOString())
    .single()

  if (match) {
    return { match: match as SessionMatch, error: null }
  }

  const { data: olderMatch } = await supabase
    .from('matches')
    .select('id')
    .eq('matchId', matchId)
    .eq('userId', userId)
    .single()

  if (olderMatch) {
    return { match: null, error: 'expired' }
  }

  return { match: null, error: 'notFound' }
}

export interface ResolvedMatchRow {
  matchId: string
  hero_name: string | null
  won: boolean
}

/**
 * Fetch resolved (`won` is not null) matches in the streaming session window,
 * newest first. Shared by `!recent` (limit 5), `!won` / `!lost` fallback
 * (limit 1), and any future history-style command.
 */
export async function findResolvedMatchesInSession(
  userId: string,
  streamStartDate: Date | null,
  opts: { limit: number; excludeMatchId?: string } = { limit: 5 },
): Promise<ResolvedMatchRow[]> {
  const startDate = getSessionStartDate(streamStartDate)

  let query = supabase
    .from('matches')
    .select('matchId, hero_name, won')
    .eq('userId', userId)
    .not('won', 'is', null)
    .gte('created_at', startDate.toISOString())

  if (opts.excludeMatchId) {
    query = query.neq('matchId', opts.excludeMatchId)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(opts.limit)

  if (error) {
    logger.warn('[BETS] findResolvedMatchesInSession query failed', { userId, error })
    return []
  }

  return (data ?? []) as ResolvedMatchRow[]
}

/**
 * Find the most-recently-resolved match in the streaming session window.
 * Used by `!won` / `!lost` (no arg) to auto-target the last result for a flip
 * when there's no pending DC resolution waiting.
 */
export async function findMostRecentResolvedMatch(
  userId: string,
  streamStartDate: Date | null,
  excludeMatchId?: string,
): Promise<{ matchId: string } | null> {
  const [match] = await findResolvedMatchesInSession(userId, streamStartDate, {
    limit: 1,
    excludeMatchId,
  })
  return match ? { matchId: match.matchId } : null
}

/**
 * Shared fallback for `!won` / `!lost` (no arg) when there's no pending DC
 * resolution: flip the most recently resolved match. Returns true if the
 * flip happened (caller skips the "no pending resolution" chat output).
 */
export async function resolveByMostRecentMatch(
  client: SocketClient,
  won: boolean,
  username: string,
  channel: string,
  messageId: string,
): Promise<boolean> {
  const recent = await findMostRecentResolvedMatch(
    client.token,
    client.stream_start_date,
    client.gsi?.map?.matchid,
  )
  if (!recent) return false

  await resolveMatchRetroactively(client, recent.matchId, won, username, channel, messageId)
  return true
}

/**
 * Fetch match details from Steam API
 */
async function getMatchDetails(matchId: string): Promise<MatchMinimalDetailsResponse | null> {
  return new Promise((resolve) => {
    steamSocket.emit(
      'getMatchMinimalDetails',
      { match_id: Number(matchId) },
      (err: unknown, response: MatchMinimalDetailsResponse) => {
        if (err) {
          logger.info('[BETS] Could not get match details for retroactive resolution', {
            matchId,
            error: err,
          })
          resolve(null)
        } else {
          resolve(response)
        }
      },
    )
  })
}

interface ResolveMatchResult {
  success: boolean
  errorKey?: string
}

/**
 * Close a specific Twitch prediction by its ID
 * Unlike closeTwitchBet which closes the most recent prediction,
 * this function closes only the specific prediction for retroactive resolution
 */
async function closeTwitchBetById(
  won: boolean,
  twitchId: string,
  predictionId: string,
  matchId: string,
): Promise<boolean> {
  try {
    const api = await getTwitchAPI(twitchId)

    // Fetch recent predictions and find the one matching our ID
    // We fetch more than 1 since the current game might have a different prediction
    const { data: predictions } = await retryTransient(
      () => api.predictions.getPredictions(twitchId, { limit: 10 }),
      { label: 'resolveMatch:getPredictions' },
    )

    if (!Array.isArray(predictions) || !predictions.length) {
      logger.info('[BETS] Retroactive resolution - no predictions found', {
        twitchId,
        predictionId,
        matchId,
      })
      return false
    }

    // Find the specific prediction by ID
    const prediction = predictions.find((p) => p.id === predictionId)

    if (!prediction) {
      logger.info('[BETS] Retroactive resolution - specific prediction not found in recent list', {
        twitchId,
        predictionId,
        matchId,
        availablePredictions: predictions.map((p) => ({ id: p.id, status: p.status })),
      })
      return false
    }

    // Check if prediction is in a state that can be resolved
    // ACTIVE or LOCKED predictions can be resolved
    if (!['ACTIVE', 'LOCKED'].includes(prediction.status)) {
      logger.info('[BETS] Retroactive resolution - prediction already resolved or canceled', {
        twitchId,
        predictionId,
        matchId,
        status: prediction.status,
      })
      return false
    }

    const [wonOutcome, lossOutcome] = prediction.outcomes

    await retryTransient(
      () =>
        api.predictions.resolvePrediction(
          twitchId,
          predictionId,
          won ? wonOutcome.id : lossOutcome.id,
        ),
      { label: 'resolveMatch:resolvePrediction' },
    )

    logger.info('[BETS] Retroactive resolution - prediction resolved successfully', {
      twitchId,
      predictionId,
      matchId,
      won,
    })

    return true
  } catch (e) {
    logger.info('[BETS] Retroactive resolution - could not resolve prediction', {
      twitchId,
      predictionId,
      matchId,
      error: e,
    })
    return false
  }
}

/**
 * Retroactively resolve a match by its ID
 */
export async function resolveMatchRetroactively(
  client: SocketClient,
  matchId: string,
  won: boolean,
  resolvedByUsername: string,
  channel: string,
  messageId: string,
): Promise<ResolveMatchResult> {
  // Check if trying to resolve the current ongoing match
  const currentMatchId = client.gsi?.map?.matchid
  if (currentMatchId && matchId === currentMatchId) {
    chatClient.say(channel, t('bets.cannotResolveCurrentMatch', { lng: client.locale }), messageId)
    return { success: false, errorKey: 'currentMatch' }
  }

  // Find the match (resolved or not) within the session window
  const { match, error } = await findSessionMatch(client.token, matchId, client.stream_start_date)

  logger.info('[BETS] Retroactive resolution requested', {
    name: client.name,
    matchId,
    won,
    previousWon: match?.won ?? null,
    resolvedBy: resolvedByUsername,
  })

  if (error === 'expired') {
    chatClient.say(
      channel,
      t('bets.retroactiveMatchExpired', {
        matchId,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      messageId,
    )
    return { success: false, errorKey: 'expired' }
  }

  if (error === 'notFound' || !match) {
    chatClient.say(
      channel,
      t('bets.retroactiveMatchNotFound', {
        matchId,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      messageId,
    )
    return { success: false, errorKey: 'notFound' }
  }

  // No-op: match is already marked the way the mod asked for.
  if (match.won === won) {
    chatClient.say(
      channel,
      t('bets.retroactiveAlreadyMatches', {
        context: won ? 'won' : 'lost',
        matchId,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      messageId,
    )
    return { success: true }
  }

  const previousWon = match.won
  const isCorrection = previousWon !== null
  const isParty = match.is_party ?? false
  const handler = gsiHandlers.get(client.token)

  let lobbyType: number
  if (isCorrection) {
    // The row's lobby_type/scores were set at original resolution. Re-fetching
    // from Steam risks clobbering them with null if Steam no longer has the
    // match (common for older matches), so a flip only touches won + updated_at.
    lobbyType = match.lobby_type ?? LOBBY_TYPE_RANKED

    await supabase
      .from('matches')
      .update({ won, updated_at: new Date().toISOString() })
      .eq('id', match.id)
  } else {
    const gcData = await getMatchDetails(matchId)
    const matchData = gcData?.matches?.[0]
    lobbyType = matchData?.lobby_type ?? match.lobby_type ?? LOBBY_TYPE_RANKED

    await supabase
      .from('matches')
      .update({
        won,
        lobby_type: lobbyType,
        game_mode: matchData?.game_mode ?? 22,
        radiant_score: matchData?.radiant_score ?? null,
        dire_score: matchData?.dire_score ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)
  }

  const isRanked = lobbyType === LOBBY_TYPE_RANKED

  logger.info('[BETS] Retroactive resolution - match updated in database', {
    name: client.name,
    matchId,
    won,
    previousWon,
    lobbyType,
    isRanked,
  })

  // Update MMR if it's a ranked game. For a flip we need to reverse the old
  // delta AND apply the new one, so the magnitude doubles.
  if (isRanked && match.steam32Id) {
    const mmrSize = isParty ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
    const mmrDelta = (won ? mmrSize : -mmrSize) * (isCorrection ? 2 : 1)
    const newMMR = client.mmr + mmrDelta

    await updateMmr({
      currentMmr: client.mmr,
      newMmr: newMMR,
      steam32Id: match.steam32Id,
      channel: client.name,
      token: client.token,
    })

    logger.info('[BETS] Retroactive resolution - MMR updated', {
      name: client.name,
      matchId,
      oldMmr: client.mmr,
      newMmr: newMMR,
      isParty,
      isCorrection,
    })
  }

  // Close the specific Twitch prediction only on a first-time resolution.
  // Already-resolved predictions can't be re-resolved on Twitch's side,
  // so we don't try when flipping a previously recorded result.
  if (!isCorrection && match.predictionId) {
    const channelId = handler?.getChannelId() ?? client.Account?.providerAccountId

    if (channelId) {
      const closed = await closeTwitchBetById(won, channelId, match.predictionId, matchId)
      if (closed) {
        logger.info('[BETS] Retroactive resolution - Twitch prediction closed', {
          name: client.name,
          matchId,
          predictionId: match.predictionId,
        })
      }
    }
  }

  handler?.emitWLUpdate()

  // Send success message
  chatClient.say(
    channel,
    t(isCorrection ? 'bets.retroactiveCorrection' : 'bets.retroactiveResolutionSuccess', {
      context: won ? 'won' : 'lost',
      previousContext: previousWon ? 'won' : 'lost',
      matchId,
      username: resolvedByUsername,
      lng: client.locale,
    }),
    messageId,
  )

  logger.info('[BETS] Retroactive resolution completed successfully', {
    name: client.name,
    matchId,
    won,
    previousWon,
    isCorrection,
    resolvedBy: resolvedByUsername,
  })

  return { success: true }
}
