import { getTwitchAPI, logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { LOBBY_TYPE_RANKED, MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/getWL.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import { steamSocket } from '../../steam/ws.js'
import type { MatchMinimalDetailsResponse, SocketClient } from '../../types.js'
import { chatClient } from '../chatClient.js'

interface UnresolvedMatch {
  id: string
  matchId: string
  myTeam: string
  predictionId: string | null
  steam32Id: number | null
  lobby_type: number | null
  is_party: boolean | null
}

/**
 * Find an unresolved match within the streaming session time window
 */
async function findUnresolvedMatch(
  userId: string,
  matchId: string,
  streamStartDate?: Date | null,
): Promise<{ match: UnresolvedMatch | null; error: string | null }> {
  // Use stream start date or last 12 hours (same logic as getWL.ts)
  const startDate =
    streamStartDate ?? new Date(Date.now() - 12 * 60 * 60 * 1000)

  const { data: match, error } = await supabase
    .from('matches')
    .select('id, matchId, myTeam, predictionId, steam32Id, lobby_type, is_party')
    .eq('matchId', matchId)
    .eq('userId', userId)
    .is('won', null)
    .gte('created_at', startDate.toISOString())
    .single()

  if (error || !match) {
    // Check if the match exists but is already resolved
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('won')
      .eq('matchId', matchId)
      .eq('userId', userId)
      .single()

    if (existingMatch) {
      return { match: null, error: 'alreadyResolved' }
    }

    // Check if match exists but is too old
    const { data: oldMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('matchId', matchId)
      .eq('userId', userId)
      .is('won', null)
      .single()

    if (oldMatch) {
      return { match: null, error: 'expired' }
    }

    return { match: null, error: 'notFound' }
  }

  return { match: match as UnresolvedMatch, error: null }
}

/**
 * Fetch match details from Steam API
 */
async function getMatchDetails(matchId: string): Promise<MatchMinimalDetailsResponse | null> {
  return new Promise((resolve) => {
    steamSocket.emit(
      'getMatchMinimalDetails',
      { match_id: Number(matchId) },
      (err: any, response: any) => {
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
    const { data: predictions } = await api.predictions.getPredictions(twitchId, {
      limit: 10,
    })

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

    await api.predictions.resolvePrediction(
      twitchId,
      predictionId,
      won ? wonOutcome.id : lossOutcome.id,
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
    chatClient.say(
      channel,
      t('bets.cannotResolveCurrentMatch', { lng: client.locale }),
      messageId,
    )
    return { success: false, errorKey: 'currentMatch' }
  }

  logger.info('[BETS] Retroactive resolution requested', {
    name: client.name,
    matchId,
    won,
    resolvedBy: resolvedByUsername,
  })

  // Find the unresolved match
  const { match, error } = await findUnresolvedMatch(
    client.token,
    matchId,
    client.stream_start_date,
  )

  if (error === 'alreadyResolved') {
    chatClient.say(
      channel,
      t('bets.retroactiveMatchNotFound', {
        matchId,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      messageId,
    )
    return { success: false, errorKey: 'alreadyResolved' }
  }

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

  // Fetch match details from Steam for scores, lobby type, etc.
  const gcData = await getMatchDetails(matchId)
  const matchData = gcData?.matches?.[0]

  // Determine lobby type and other details (default to ranked if unknown)
  const lobbyType = matchData?.lobby_type ?? match.lobby_type ?? LOBBY_TYPE_RANKED
  const gameMode = matchData?.game_mode ?? 22 // Default to All Pick
  const isParty = match.is_party ?? false
  const isRanked = lobbyType === LOBBY_TYPE_RANKED

  // Get scores from Steam data if available
  const scores = {
    kda: null,
    radiant_score: matchData?.radiant_score ?? null,
    dire_score: matchData?.dire_score ?? null,
  }

  // Update the match in the database
  await supabase
    .from('matches')
    .update({
      won,
      lobby_type: lobbyType,
      game_mode: gameMode,
      radiant_score: scores.radiant_score,
      dire_score: scores.dire_score,
      updated_at: new Date().toISOString(),
    })
    .eq('id', match.id)

  logger.info('[BETS] Retroactive resolution - match updated in database', {
    name: client.name,
    matchId,
    won,
    lobbyType,
    isRanked,
  })

  // Update MMR if it's a ranked game
  if (isRanked && match.steam32Id) {
    const mmrSize = isParty ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
    const newMMR = client.mmr + (won ? mmrSize : -mmrSize)

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
    })
  }

  // Try to close the specific Twitch prediction for this match
  if (match.predictionId) {
    const handler = gsiHandlers.get(client.token)
    const channelId = handler?.getChannelId() ?? client.Account?.providerAccountId

    if (channelId) {
      // Use the specific prediction ID from the match, not the current prediction
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

  // Emit WL update if handler exists
  const handler = gsiHandlers.get(client.token)
  handler?.emitWLUpdate()

  // Send success message
  chatClient.say(
    channel,
    t('bets.retroactiveResolutionSuccess', {
      context: won ? 'won' : 'lost',
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
    resolvedBy: resolvedByUsername,
  })

  return { success: true }
}

