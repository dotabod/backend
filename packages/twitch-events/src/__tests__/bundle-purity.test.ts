// Explicit node types reference — staged single-file lint and
// doesn't pick up the package's @types/node from the workspace tree, so
// without this it spuriously errors on the node:* imports below.
/// <reference types="node" />
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Regression guard for the Node 24 ERR_AMBIGUOUS_MODULE_SYNTAX crash:
//   subscriptionHealthCheck.ts had `if (require.main === module)` at the
//   bottom for the CLI entry point. In ESM that block is dead, but the
//   bundler (tsdown / Rolldown) inlined it verbatim into dist/index.js,
//   shimming `require` to `__require`. Combined with top-level await
//   elsewhere in the bundle (e.g. handleNewUser.ts:5), Node 24 refused
//   to pick a module format and crashed at startup.
//
// Fix: CJS entry-point gates must live in src/scripts/, which is NOT in
// the import graph of src/index.ts and therefore not bundled.
//
// These tests fail FAST (source scan) and SLOW (actually build + parse).

const SRC = path.dirname(import.meta.dirname)
const PKG = path.dirname(SRC)
const BUNDLE = path.join(PKG, 'dist', 'index.js')

const walk = function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry)
    if (statSync(p).isDirectory()) {
      // CLI-only entries live under src/scripts/ and are never bundled.
      if (entry === 'scripts' || entry === '__tests__') {
        continue
      }
      walk(p, out)
    } else if (entry.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

describe('bundle purity', () => {
  it('no `require.main` in any module reachable from src/index.ts', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (/\brequire\.main\b/u.test(readFileSync(file, 'utf-8'))) {
        offenders.push(file)
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('no `module.exports` in any module reachable from src/index.ts', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (/\bmodule\.exports\b/u.test(readFileSync(file, 'utf-8'))) {
        offenders.push(file)
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('dist/index.js parses cleanly as ESM (when present)', () => {
    if (!existsSync(BUNDLE)) {
      // Skip in environments where the bundle isn't built yet (most local
      // test runs). CI will have it after `pnpm --filter @dotabod/twitch-events run build`.
      return
    }
    // node --check exits 0 on parseable input, non-zero (and prints to stderr)
    // on ERR_AMBIGUOUS_MODULE_SYNTAX / syntax errors.
    expect(() => execSync(`node --check ${BUNDLE}`, { stdio: 'pipe' })).not.toThrow()
    // Belt and suspenders: the specific CJS marker the bundler shimmed should
    // never appear in a pure-ESM bundle with top-level await.
    const bundle = readFileSync(BUNDLE, 'utf-8')
    expect(bundle).not.toMatch(/__require\.main/u)
  })
})
