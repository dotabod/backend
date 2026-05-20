import { describe, expect, it } from 'bun:test'

// Regression guard documenting WHY every bun service must set
// NEW_RELIC_NATIVE_METRICS_ENABLED=false (see CLAUDE.md + docker-compose.yml).
//
// @newrelic/native-metrics ships a V8-ABI native addon (nan-based, loaded at
// require time via node-gyp-build). bun's runtime is JavaScriptCore, not V8,
// so it cannot use the module. The *surface* of the failure varies by version
// and platform — all confirmed by hand:
//   - newrelic 12 / native-metrics 11, linux-arm64 (prod): uncatchable
//     `symbol lookup error: ... undefined symbol: _ZN2v816FunctionTemplate...`
//   - newrelic 12 / native-metrics 11, darwin-arm64: segfault / panic
//   - newrelic 14 / native-metrics 13, linux-arm64: SAME symbol-lookup crash
//   - newrelic 14 / native-metrics 13, darwin-arm64: catchable ABI-mismatch
//     throw (NODE_MODULE_VERSION mismatch) — graceful, darwin only
// So a v14 bump does NOT make native metrics safe on the Linux servers.
//
// The invariant we actually depend on is version/platform-agnostic: the native
// module never *successfully loads* under bun. We assert that by running a
// subprocess that prints a sentinel only if require() returns — and checking
// the sentinel is absent. This holds whether the failure is a hard crash
// (no output) or a thrown error (sentinel never reached). If a future bun
// release or an N-API rewrite of native-metrics makes it loadable, the
// sentinel appears, this test fails, and we revisit the env-var workaround.

const SENTINEL = 'NATIVE_METRICS_LOADED_OK'

describe('@newrelic/native-metrics under bun', () => {
  it('never loads successfully under bun — hence NEW_RELIC_NATIVE_METRICS_ENABLED=false', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', '-e', `require('@newrelic/native-metrics'); console.log('${SENTINEL}')`],
      cwd: import.meta.dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = proc.stdout.toString()
    const stderr = proc.stderr.toString()

    // Sanity: the module must actually be installed/resolvable, otherwise the
    // test would pass for the wrong reason (a "Cannot find module" miss).
    expect(stderr.includes('Cannot find module')).toBe(false)

    // The core invariant: require() must NOT complete. If it had, the sentinel
    // would have printed. Every failure shape we've observed leaves the
    // sentinel absent — hard crash (no output, e.g. v11/v13 on Linux),
    // segfault (v11 on darwin), or bun aborting the -e script while still
    // exiting 0 (v13 on darwin). Deliberately NOT asserting on exit code or
    // crash strings: those differ by version/platform, sentinel-absence does
    // not. If bun (or an N-API rewrite of native-metrics) ever makes the addon
    // loadable, the sentinel prints, this fails, and we revisit the workaround.
    expect(stdout.includes(SENTINEL)).toBe(false)
  })
})
