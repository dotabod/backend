// Standalone CLI entry point for the subscription health check. Invoked
// hourly by `.github/workflows/subscription-health-check.yml` and runnable
// locally via `pnpm run subscription-health-check`.
//
// This file is intentionally OUTSIDE the import graph of src/index.ts so it
// doesn't get bundled into dist/index.js. The previous in-file
// `if (require.main === module)` gate injected a CJS marker into the prod
// bundle and clashed with the bundle's top-level await, crashing Node 24
// with ERR_AMBIGUOUS_MODULE_SYNTAX at startup.
import { logger } from '@dotabod/shared-utils'

import { runSubscriptionHealthCheck } from '../utils/subscription-health-check'

const run = async function run(): Promise<void> {
  try {
    const result = await runSubscriptionHealthCheck()
    process.exitCode = result.criticalFixCount > 0 ? 1 : 0
  } catch (error) {
    logger.error('[TWITCHEVENTS] Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  }
}

await run()
