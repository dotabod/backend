// Static regression guard for commit 8621e401 ("refactor(disable-reason): hide
// inverted commandDisable semantics behind a facade").
//
// commandDisable has INVERTED semantics (value: true means disabled). Calling
// trackDisableReason / trackResolveReason directly with 'commandDisable' is the
// exact bug class the facade exists to prevent — every site got the inversion
// wrong at least once historically (commits 60004e0b, 069add62, 26cc40af,
// b14e8d6b). This test fails if any source file outside the facade
// re-introduces a direct call.
//
// If you're adding a new disable reason for commandDisable: use the facade
// (`commandDisable.disable / .enable / .recordNotification`). If you're adding
// a NON-inverted setting (e.g. bets), trackDisableReason is fine — that's
// already used by openTwitchBet.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

// import.meta.dirname → packages/shared-utils/tests; '../..' lifts to packages/.
const REPO_PACKAGES = join(import.meta.dirname, '../..')

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '__tests__', 'tests', 'test'])

// commandDisable.ts is the facade — it's the only place allowed to call the
// primitives with 'commandDisable'.
const ALLOWED_FILES = new Set([
  join(REPO_PACKAGES, 'shared-utils/src/disableReason/commandDisable.ts'),
  // The facade-pinning test itself contains the disallowed strings in patterns/comments.
  join(REPO_PACKAGES, 'shared-utils/tests/commandDisableFacadePin.test.ts'),
])

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      yield full
    }
  }
}

// Match `trackDisableReason(...'commandDisable'...)` and `trackResolveReason(...'commandDisable'...)`
// across reasonable line wrapping. The pattern doesn't try to parse syntax — it
// just looks for the function call containing the literal 'commandDisable' or
// "commandDisable" within a short window, which is what callers actually wrote
// in the historical bug pattern.
const VIOLATION_PATTERNS: RegExp[] = [
  /\btrackDisableReason\s*\([^)]*['"]commandDisable['"]/s,
  /\btrackResolveReason\s*\([^)]*['"]commandDisable['"]/s,
  // Catches the multi-line form where the setting key sits on its own line.
  /\btrackDisableReason\s*\([\s\S]{0,400}?['"]commandDisable['"]/,
  /\btrackResolveReason\s*\([\s\S]{0,400}?['"]commandDisable['"]/,
]

describe('commandDisable facade pinning', () => {
  it('no source file outside the facade calls trackDisableReason/trackResolveReason with commandDisable', () => {
    const offenders: Array<{ file: string; snippet: string }> = []

    for (const file of walk(REPO_PACKAGES)) {
      if (ALLOWED_FILES.has(file)) continue
      const src = readFileSync(file, 'utf8')
      // Cheap pre-filter to skip the vast majority of files.
      if (!src.includes('commandDisable')) continue
      if (!src.includes('trackDisableReason') && !src.includes('trackResolveReason')) continue

      for (const pattern of VIOLATION_PATTERNS) {
        const match = src.match(pattern)
        if (match) {
          offenders.push({
            file: file.replace(REPO_PACKAGES, 'packages'),
            snippet: match[0].slice(0, 160),
          })
          break
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${o.file}\n    ${o.snippet.replace(/\s+/g, ' ')}`)
        .join('\n')
      throw new Error(
        `Found direct trackDisableReason/trackResolveReason calls on 'commandDisable'.\n` +
          `Use the commandDisable facade (\`commandDisable.disable\`, \`commandDisable.enable\`,\n` +
          `\`commandDisable.recordNotification\`) — see packages/shared-utils/src/disableReason/commandDisable.ts.\n` +
          `Offenders:\n${msg}`,
      )
    }

    expect(offenders).toEqual([])
  })
})
