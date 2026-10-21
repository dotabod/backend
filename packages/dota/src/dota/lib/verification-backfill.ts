import { appendFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

import { logger } from '@dotabod/shared-utils'

import { applyVerification, decideVerification, fetchValveMatch } from './match-verification'
import type {
  MatchRequester,
  MatchStore,
  VerifiableMatch,
  Verification,
} from './match-verification'

const PAGE_SIZE = 500
const MAX_CONSECUTIVE_FAILURES = 10
const BACKOFF_MS = 30_000

export interface BackfillOptions {
  apply: boolean
  logPath?: string
  request: MatchRequester
  since: string
  spacingMs: number
  store: MatchStore
  unresolvedOnly: boolean
  until: string
  wait?: (ms: number) => Promise<void>
}

interface BackfillState {
  counts: Record<string, number>
  failures: number
  seen: Set<string>
}

const count = function count(state: BackfillState, key: string) {
  state.counts[key] = (state.counts[key] ?? 0) + 1
}

const recordDecision = function recordDecision(
  options: BackfillOptions,
  row: VerifiableMatch,
  verification: Verification,
  won: boolean | null
) {
  if (options.logPath !== undefined) {
    appendFileSync(
      options.logPath,
      `${JSON.stringify({ id: row.id, matchId: row.matchId, previousWon: row.won, userId: row.userId, verification, won })}\n`
    )
  }
}

// One row: ask Valve, decide, and write when applying. Never touches MMR or predictions.
const checkRow = async function checkRow(
  options: BackfillOptions,
  state: BackfillState,
  row: VerifiableMatch
): Promise<void> {
  const valve = await fetchValveMatch(options.request, row.matchId)
  if (valve === 'unavailable') {
    state.failures += 1
    if (state.failures >= MAX_CONSECUTIVE_FAILURES) {
      throw new Error('Valve requests keep failing; stopping. Rerun to resume.')
    }
    await (options.wait ?? delay)(BACKOFF_MS)
    await checkRow(options, state, row)
    return
  }
  state.failures = 0
  state.seen.add(row.id)
  if (valve === null) {
    count(state, 'not_found')
    recordDecision(options, row, 'not_found', row.won)
    if (options.apply) {
      await options.store.markVerified(row.id, 'not_found')
    }
    return
  }
  const decision = decideVerification(row, valve)
  count(state, decision.verification)
  recordDecision(options, row, decision.verification, 'won' in decision ? decision.won : row.won)
  if (options.apply && !(await applyVerification(row, decision, options.store))) {
    count(state, 'skipped: changed while running')
  }
}

const checkInOrder = async function checkInOrder(
  options: BackfillOptions,
  state: BackfillState,
  rows: VerifiableMatch[]
): Promise<void> {
  const [row, ...rest] = rows
  if (row === undefined) {
    return
  }
  await checkRow(options, state, row)
  await (options.wait ?? delay)(options.spacingMs)
  await checkInOrder(options, state, rest)
}

// Pages through [since, until) by created_at. Rows already checked in this run are skipped,
// so applied rows (which stop being unverified) and dry-run rows (which don't) both advance.
const checkPagesFrom = async function checkPagesFrom(
  options: BackfillOptions,
  state: BackfillState,
  cursor: string
): Promise<void> {
  const page = await options.store.loadUnverified({
    createdBefore: options.until,
    createdFrom: cursor,
    limit: PAGE_SIZE,
    unresolvedOnly: options.unresolvedOnly,
  })
  const fresh = page.filter((row) => !state.seen.has(row.id))
  if (fresh.length === 0) {
    return
  }
  await checkInOrder(options, state, fresh)
  const next = page.at(-1)?.created_at ?? options.until
  logger.info('[VERIFY] Backfill progress', { checked: state.seen.size, cursor: next })
  await checkPagesFrom(options, state, next)
}

export const runBackfill = async function runBackfill(
  options: BackfillOptions
): Promise<Record<string, number>> {
  const state: BackfillState = { counts: {}, failures: 0, seen: new Set() }
  await checkPagesFrom(options, state, options.since)
  return { ...state.counts, checked: state.seen.size }
}
