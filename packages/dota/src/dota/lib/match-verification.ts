import { promisify } from 'node:util'

import { logger } from '@dotabod/shared-utils'
import type { Socket } from 'socket.io-client'
import { z } from 'zod'

import { heroes } from './hero-list'

type Team = 'radiant' | 'dire'

// Valve's EMatchOutcome values that name a winner. Everything else (0 unknown,
// 64+ not scored: leaver, poor network, server crash, never started, ...) does not.
const WINNER_BY_OUTCOME = new Map<number, Team>([
  [2, 'radiant'],
  [3, 'dire'],
])
const TEAM_BY_GC_NUMBER = new Map<number, Team>([
  [0, 'radiant'],
  [1, 'dire'],
])
const VALVE_REQUEST_TIMEOUT_MS = 15_000
const UINT32 = 4_294_967_296n

export type Verification =
  | 'confirmed'
  | 'corrected'
  | 'not_found'
  | 'not_scored'
  | 'resolved'
  | 'team_mismatch'
  | 'team_unknown'

export interface VerifiableMatch {
  created_at: string
  hero_name: string | null
  id: string
  is_party: boolean
  lobby_type: number | null
  matchId: string
  myTeam: string
  predictionId: string | null
  steam32Id: number | null
  updated_at: string
  userId: string
  won: boolean | null
}

// The GC sends match ids as protobuf Longs; tests and other callers may use plain ids
const matchIdSchema = z.union([
  z
    .object({ high: z.number(), low: z.number() })
    .transform(({ high, low }) =>
      (BigInt.asUintN(32, BigInt(high)) * UINT32 + BigInt.asUintN(32, BigInt(low))).toString()
    ),
  z.number().transform(String),
  z.string(),
])

const valveMatchSchema = z.object({
  dire_score: z.number(),
  game_mode: z.number(),
  lobby_type: z.number(),
  match_id: matchIdSchema,
  match_outcome: z.number(),
  players: z.array(
    z.object({ account_id: z.number(), hero_id: z.number(), team_number: z.number() })
  ),
  radiant_score: z.number(),
})
const valveResponseSchema = z.object({ matches: z.array(valveMatchSchema) })

export type ValveMatch = z.output<typeof valveMatchSchema>

// Valve's minimal details for one match, or null when the GC does not have it (yet).
// Throws when the request itself fails.
export type MatchRequester = (matchId: string) => Promise<ValveMatch | null>

type ValveParseResult = ReturnType<typeof valveResponseSchema.safeParse>

// Keeps only an answer for the match that was asked about
const requestedMatch = function requestedMatch(
  parsed: ValveParseResult,
  matchId: string
): ValveMatch | null {
  const match = parsed.success ? parsed.data.matches.at(0) : undefined
  return match !== undefined && match.match_id === matchId ? match : null
}

export const parseValveResponse = function parseValveResponse(
  response: z.input<typeof valveResponseSchema> | null,
  matchId: string
): ValveMatch | null {
  return requestedMatch(valveResponseSchema.safeParse(response), matchId)
}

type SteamAck = (
  ackError: Error | null,
  serverError: string | null,
  response: z.input<typeof valveResponseSchema> | null
) => void

// The steam service acks with (error, response). emitWithAck can't read that shape: it
// resolves with the first argument, the null error, so the callback form is used instead.
export const socketMatchRequester = function socketMatchRequester(socket: Socket): MatchRequester {
  const ask = promisify(
    (
      matchId: number,
      done: (error: Error | null, response?: z.input<typeof valveResponseSchema> | null) => void
    ) => {
      const ack: SteamAck = (ackError, serverError, response) => {
        const serverFailure = serverError === null ? null : new Error(serverError)
        done(ackError ?? serverFailure, response)
      }
      socket
        .timeout(VALVE_REQUEST_TIMEOUT_MS)
        .emit('getMatchMinimalDetails', { match_id: matchId }, ack)
    }
  )
  return async (matchId) =>
    requestedMatch(valveResponseSchema.safeParse(await ask(Number(matchId))), matchId)
}

// 'unavailable' when the request failed, so callers can back off instead of retrying hard
export const fetchValveMatch = async function fetchValveMatch(
  request: MatchRequester,
  matchId: string
): Promise<ValveMatch | null | 'unavailable'> {
  try {
    return await request(matchId)
  } catch (error) {
    logger.info('[VERIFY] Valve match request failed', {
      error: error instanceof Error ? error.message : String(error),
      matchId,
    })
    return 'unavailable'
  }
}

interface ResultWrite {
  direScore: number
  gameMode: number
  lobbyType: number
  radiantScore: number
  verification: 'corrected' | 'resolved'
  won: boolean
}

// Outcomes that only mark the row; `not_found` is decided without a Valve answer
type MarkOnly = Exclude<Verification, ResultWrite['verification'] | 'not_found'>

export type VerificationDecision = ResultWrite | { verification: MarkOnly }

interface UnverifiedQuery {
  createdBefore: string
  createdFrom: string
  limit: number
  unresolvedOnly: boolean
}

export interface MatchStore {
  loadUnverified: (query: UnverifiedQuery) => Promise<VerifiableMatch[]>
  markVerified: (id: string, verification: Verification) => Promise<void>
  // Writes only while the row's result still equals `expectedWon`; returns whether it did
  writeResult: (id: string, expectedWon: boolean | null, result: ResultWrite) => Promise<boolean>
}

// What changes for a live streamer when a result is filled in or flipped. The verifier
// supplies these only for streamers loaded in memory; backfills leave them out.
export interface OnlineEffects {
  adjustMmr: (row: VerifiableMatch, won: boolean, isCorrection: boolean) => Promise<void>
  closePrediction: (row: VerifiableMatch, won: boolean) => Promise<void>
  refreshWinLoss: () => void
}

export const getHeroIdByName = function getHeroIdByName(name: string | null): number | null {
  if (name === null) {
    return null
  }
  return Object.entries(heroes).find(([key]) => key === name)?.[1].id ?? null
}

// The streamer's team in Valve's data, from their account id and/or the one player on
// their hero (anonymous accounts come back as 0). Null when the two disagree or neither
// identifies a player.
const findStreamerTeam = function findStreamerTeam(
  row: VerifiableMatch,
  valve: ValveMatch
): Team | null {
  const heroId = getHeroIdByName(row.hero_name)
  const heroPlayers = valve.players.filter((player) => heroId !== null && player.hero_id === heroId)
  const identified = [
    ...valve.players.filter(
      (player) => row.steam32Id !== null && player.account_id === row.steam32Id
    ),
    ...(heroPlayers.length === 1 ? heroPlayers : []),
  ]
  const teams = new Set(identified.map((player) => TEAM_BY_GC_NUMBER.get(player.team_number)))
  const [team] = teams
  return teams.size === 1 && team !== undefined ? team : null
}

export const decideVerification = function decideVerification(
  row: VerifiableMatch,
  valve: ValveMatch
): VerificationDecision {
  const winner = WINNER_BY_OUTCOME.get(valve.match_outcome)
  if (winner === undefined) {
    return { verification: 'not_scored' }
  }
  const team = findStreamerTeam(row, valve)
  if (team === null) {
    return { verification: 'team_unknown' }
  }
  if (team !== row.myTeam) {
    return { verification: 'team_mismatch' }
  }
  const won = winner === team
  if (row.won === won) {
    return { verification: 'confirmed' }
  }
  return {
    direScore: valve.dire_score,
    gameMode: valve.game_mode,
    lobbyType: valve.lobby_type,
    radiantScore: valve.radiant_score,
    verification: row.won === null ? 'resolved' : 'corrected',
    won,
  }
}

// Writes a decision. A result is only written while the row still holds the value it was
// decided from, so a live resolution or a mod's !won/!lost in the meantime wins; that row
// stays unverified and is checked again on the next pass. Returns whether it was written.
export const applyVerification = async function applyVerification(
  row: VerifiableMatch,
  decision: VerificationDecision,
  store: MatchStore,
  effects?: OnlineEffects
): Promise<boolean> {
  if (!('won' in decision)) {
    await store.markVerified(row.id, decision.verification)
    return true
  }
  if (!(await store.writeResult(row.id, row.won, decision))) {
    return false
  }

  const isCorrection = decision.verification === 'corrected'
  const log = isCorrection ? logger.error : logger.info
  log('[VERIFY] Match result written from Valve data', {
    matchId: row.matchId,
    previousWon: row.won,
    userId: row.userId,
    verification: decision.verification,
    won: decision.won,
  })

  if (effects !== undefined) {
    await effects.adjustMmr({ ...row, lobby_type: decision.lobbyType }, decision.won, isCorrection)
    if (!isCorrection) {
      await effects.closePrediction(row, decision.won)
    }
    effects.refreshWinLoss()
  }
  return true
}
