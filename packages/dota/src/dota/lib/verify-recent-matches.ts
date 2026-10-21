import { setTimeout as delay } from 'node:timers/promises'

import { logger } from '@dotabod/shared-utils'

import { LOBBY_TYPE_RANKED, MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/get-wl'
import type { GSIHandlerType } from '../gsi-handler-types'
import { applyVerification, decideVerification, fetchValveMatch } from './match-verification'
import type {
  MatchRequester,
  MatchStore,
  OnlineEffects,
  VerifiableMatch,
} from './match-verification'
import type { UpdateMmrParams } from './update-mmr'

// Rows stay candidates for two days; anything older is a job for scripts/verify-matches.ts.
const CANDIDATE_WINDOW_MS = 48 * 60 * 60 * 1000
// Let the live closing path finish its own writes (MMR, prediction) before checking it.
const RESOLVED_SETTLE_MS = 2 * 60 * 1000
// An unresolved match Valve doesn't have yet is usually still being played.
const UNRESOLVED_RECHECK_MS = 10 * 60 * 1000
// Valve has every scored match within minutes of the end; past this it never will.
const NOT_FOUND_AFTER_MS = 6 * 60 * 60 * 1000
const CANDIDATES_PER_RUN = 500
const CHECKS_PER_RUN = 100
const REQUEST_SPACING_MS = 500

export interface MatchVerifierDeps {
  closePrediction: (
    won: boolean,
    channelId: string,
    predictionId: string,
    matchId: string
  ) => Promise<boolean>
  handlers: ReadonlyMap<string, GSIHandlerType>
  isConnected: () => boolean
  request: MatchRequester
  store: MatchStore
  updateMmr: (params: UpdateMmrParams) => Promise<void>
  wait?: (ms: number) => Promise<void>
}

type CheckResult = 'checked' | 'stop'

// Same MMR and prediction handling as a mod's !won/!lost, for a streamer loaded in memory
const onlineEffectsFor = function onlineEffectsFor(
  deps: MatchVerifierDeps,
  row: VerifiableMatch
): OnlineEffects | undefined {
  const handler = deps.handlers.get(row.userId)
  if (handler === undefined) {
    return undefined
  }
  const { client } = handler
  return {
    async adjustMmr(match, won, isCorrection) {
      if (
        match.lobby_type !== LOBBY_TYPE_RANKED ||
        match.steam32Id === null ||
        match.steam32Id !== client.steam32Id
      ) {
        return
      }
      const size = match.is_party ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
      const delta = (won ? size : -size) * (isCorrection ? 2 : 1)
      await deps.updateMmr({
        channel: client.name,
        currentMmr: client.mmr,
        newMmr: client.mmr + delta,
        steam32Id: match.steam32Id,
        token: client.token,
      })
    },
    async closePrediction(match, won) {
      const channelId = handler.getChannelId()
      if (match.predictionId !== null && match.predictionId.length > 0 && channelId.length > 0) {
        await deps.closePrediction(won, channelId, match.predictionId, match.matchId)
      }
    },
    refreshWinLoss() {
      handler.emitWLUpdate()
    },
  }
}

// Checks each recent match against Valve once it has finished: confirms recorded results,
// fills in missing ones, and corrects wrong ones. Returns the function to run on an interval.
export const createMatchVerifier = function createMatchVerifier(deps: MatchVerifierDeps) {
  const wait = deps.wait ?? delay
  const lastUnresolvedCheck = new Map<string, number>()
  let running = false

  const isDue = (row: VerifiableMatch, now: number) => {
    if (deps.handlers.get(row.userId)?.client.gsi?.map?.matchid === row.matchId) {
      return false
    }
    if (row.won !== null) {
      return now - new Date(row.updated_at).getTime() >= RESOLVED_SETTLE_MS
    }
    return now - (lastUnresolvedCheck.get(row.id) ?? 0) >= UNRESOLVED_RECHECK_MS
  }

  const checkOne = async (
    row: VerifiableMatch,
    now: number,
    counts: Map<string, number>
  ): Promise<CheckResult> => {
    const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
    const valve = await fetchValveMatch(deps.request, row.matchId)
    if (valve === 'unavailable') {
      count('unavailable')
      return 'stop'
    }
    if (valve === null) {
      lastUnresolvedCheck.set(row.id, now)
      if (now - new Date(row.created_at).getTime() >= NOT_FOUND_AFTER_MS) {
        await deps.store.markVerified(row.id, 'not_found')
        lastUnresolvedCheck.delete(row.id)
        count('not_found')
      }
      return 'checked'
    }
    const decision = decideVerification(row, valve)
    if (await applyVerification(row, decision, deps.store, onlineEffectsFor(deps, row))) {
      lastUnresolvedCheck.delete(row.id)
      count(decision.verification)
    }
    return 'checked'
  }

  const checkInOrder = async (
    rows: VerifiableMatch[],
    now: number,
    counts: Map<string, number>
  ): Promise<void> => {
    const [row, ...rest] = rows
    if (row === undefined || (await checkOne(row, now, counts)) === 'stop') {
      return
    }
    if (rest.length > 0) {
      await wait(REQUEST_SPACING_MS)
      await checkInOrder(rest, now, counts)
    }
  }

  return async function verifyRecentMatches(): Promise<void> {
    if (running || !deps.isConnected()) {
      return
    }
    running = true
    const counts = new Map<string, number>()
    try {
      const now = Date.now()
      for (const [id, checkedAt] of lastUnresolvedCheck) {
        if (now - checkedAt >= CANDIDATE_WINDOW_MS) {
          lastUnresolvedCheck.delete(id)
        }
      }
      const rows = await deps.store.loadUnverified({
        createdBefore: new Date(now).toISOString(),
        createdFrom: new Date(now - CANDIDATE_WINDOW_MS).toISOString(),
        limit: CANDIDATES_PER_RUN,
        unresolvedOnly: false,
      })
      await checkInOrder(
        rows.filter((row) => isDue(row, now)).slice(0, CHECKS_PER_RUN),
        now,
        counts
      )
    } catch (error) {
      logger.error('[VERIFY] Verifying recent matches failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      running = false
      if (counts.size > 0) {
        logger.info('[VERIFY] Checked recent matches against Valve', Object.fromEntries(counts))
      }
    }
  }
}
