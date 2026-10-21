// Checks a date range of matches against Valve and optionally writes the results, so a
// backfill is one command. Runs inside the dota container, which has HOST_STEAM and the
// database env:
//
//   node dist/scripts/verify-matches.js --since 2026-09-02 --until 2026-10-21              # dry run
//   node dist/scripts/verify-matches.js --since 2026-09-02 --until 2026-10-21 --apply --log /tmp/v.jsonl
//
// Only unverified rows are read, so an applied run that stops part way resumes where it
// left off. MMR is never changed: a streamer may have corrected it with !setmmr since.
//
// This file is outside the import graph of src/index.ts so it isn't bundled into the
// service (see packages/twitch-events/src/scripts/run-subscription-health-check.ts).
import { parseArgs } from 'node:util'

import { logger } from '@dotabod/shared-utils'
import { io } from 'socket.io-client'

import { supabaseMatchStore } from '../dota/lib/match-store'
import { socketMatchRequester } from '../dota/lib/match-verification'
import { runBackfill } from '../dota/lib/verification-backfill'

const { values: args } = parseArgs({
  options: {
    apply: { default: false, type: 'boolean' },
    log: { type: 'string' },
    since: { type: 'string' },
    'spacing-ms': { default: '500', type: 'string' },
    'unresolved-only': { default: false, type: 'boolean' },
    until: { type: 'string' },
  },
})

const socket = io(`ws://${process.env.HOST_STEAM}:5035`)

try {
  if (args.since === undefined || args.until === undefined) {
    throw new Error('Pass --since and --until (ISO dates)')
  }
  const counts = await runBackfill({
    apply: args.apply,
    logPath: args.log,
    request: socketMatchRequester(socket),
    since: new Date(args.since).toISOString(),
    spacingMs: Number(args['spacing-ms']),
    store: supabaseMatchStore,
    unresolvedOnly: args['unresolved-only'],
    until: new Date(args.until).toISOString(),
  })
  logger.info(
    args.apply ? '[VERIFY] Backfill applied' : '[VERIFY] Backfill dry run (pass --apply to write)',
    counts
  )
  process.exitCode = 0
} catch (error) {
  logger.error('[VERIFY] Backfill failed', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
} finally {
  socket.close()
}
// The shared Supabase and logger clients keep the event loop alive
process.exit()
