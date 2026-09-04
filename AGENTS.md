# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Project Commands

- Install: `vp install` (delegates to pnpm via `packageManager`)
- Build: `vp run build:all` or per package: `pnpm --filter @dotabod/{package} run build`
- Lint + format + typecheck: `vp check` (auto-fix: `vp check --fix`)
- Test: `vp test` for the whole workspace, or a specific path: `vp test packages/path/to/file.test.ts`
- Runtime: services are Node 24; dev with `tsx watch src/index.ts`, prod with `node dist/index.js`

## Code Style

- TypeScript: Use strict types with explicit return types for exported functions
- Formatting: 2-space indentation, 100 char line width, single quotes
- Imports: Use ESM module syntax with explicit file extensions
- Error handling: Use try/catch for async operations, with Winston for logging
- Testing: Files end with `.test.ts` or in `__tests__` directories

## Project Structure

- Monorepo with packages in `packages/` and microservices in `services/`
- Avoid circular dependencies (see CIRCULAR-DEPS.md)
- Docker Compose is used for development and production environments

## Single-replica constraint (no horizontal scaling / rolling overlap)

Each service must run as **exactly one replica**. They are stateful singletons and running two at once breaks things: `dota` holds per-token game state in memory and fires non-idempotent side effects with no cross-instance coordination (no socket.io Redis adapter, so overlay emits only reach the process the overlay's socket is on; no Redis lock around bet open/close, so two instances can create duplicate Twitch predictions; `map.game_state` can double-create clips). `steam` logs into one Steam account (a 2nd login mutually kicks the Dota GC session). `twitch-chat` registers an EventSub conduit shard per instance (two → duplicate chat messages). `twitch-events` is the singleton conduit manager. This also rules out Coolify _rolling_ deploys (which briefly run old+new together); deploys are a hard cutover, which is fine — each service recovers in single-digit seconds and the GSI/socket/webhook paths all self-heal via retry/reconnect. To ever scale `dota` past one replica you'd first need a socket.io Redis adapter + a cross-instance bet lock (covering both `GSIHandler` and `events/gsi-events/hero.name.ts`).

## CPU profile capture (Coolify)

Each service runs on Coolify with `node --cpu-prof` gated by the `CPU_PROF` env var. Coolify app UUIDs: dota `i8gccg8`, twitch-events `zwg4g4c`, twitch-chat `zwgkg48`, steam `wsgwk8s`.

To capture: in Coolify → `<service>` app → set env `CPU_PROF=1` → Restart → let it serve traffic ~5 min → Stop (SIGTERM triggers `process.exit(0)`, node flushes). This workspace normally runs directly on `oracle`, so retrieve locally first:

```sh
sudo -n sh -lc 'cat /var/lib/docker/volumes/<uuid>-profiles/_data/CPU.*.cpuprofile' > svc.cpuprofile
```

Only when the current host does not run the `coolify` container, use the remote fallback:
`ssh oracle "sudo sh -lc 'cat /var/lib/docker/volumes/<uuid>-profiles/_data/CPU.*.cpuprofile'" > svc.cpuprofile`.
If Coolify is local but the volume is missing, treat that as a local deployment/profile problem.

Open in Chrome DevTools → Performance → Load profile. Source maps resolve frames to `src/...`. Set `CPU_PROF=` back to empty + Restart when done.

**Monitoring — why no in-container New Relic APM agent:** The Node APM agent (loaded via `-r newrelic`) burned excessive CPU for little benefit — dota alone sat at ~40% container CPU emitting ~540k APM datapoints/30min — so it was removed in 2026-05. Observability now comes entirely from the Oracle host `newrelic-infra` agent: `nri-docker` emits `ContainerSample` (CPU/mem/restart, faceted by `label.coolify.resourceName`) and host fluent-bit forwards container logs to NR with a `container_name` attribute. Tradeoff: we lost APM-only HTTP signals (response time, apdex, throughput, transaction error rate) with no host equivalent — backend alerts/dashboards were migrated to `ContainerSample`/`Log` queries accordingly. Do NOT re-add the `newrelic` package or `-r newrelic` to the services.

**Rollback to a prior image:** look up a previous master digest with `gh api "/orgs/dotabod/packages/container/<service>/versions?per_page=5" --jq '.[] | select(.metadata.container.tags == ["master"]) | .name'`, then paste `sha256-<digest>` (dash, not colon) in Coolify's image tag/hash field and Redeploy.

## Vision roster pipeline (`!np` / `!gm`)

Chat rosters are assembled from up to **three Twitch clips**, each read by a different detector
and each carrying different data. Most "wrong roster" bugs are really "which clip landed?".

| clip     | fires at                | endpoint          | contains                   |
| -------- | ----------------------- | ----------------- | -------------------------- |
| draft    | `PLAYER_DRAFT` +46s     | `/detect_draft`   | names only, **no heroes**  |
| strategy | `STRATEGY_TIME` +43.75s | `/detect`         | **names + ranks + heroes** |
| in-game  | `GAME_IN_PROGRESS` +60s | `/detect_in_game` | heroes only, **no names**  |

Only the **strategy/loadout panel** carries names + ranks + heroes together — miss it and nothing
downstream recovers names. Scheduling: `packages/dota/src/dota/events/gsi-events/map.game_state.ts`.

Non-obvious constraints, all verified against production data — re-deriving them costs hours:

- **The draft name strip is not in slot order.** Three verified alignments give three different
  permutations; only draft index 0 (Radiant captain) is stable. Draft↔roster merging must go
  through the fuzzy _name_ matcher (`_align_players_with_draft`), never a positional join. An
  in-game result with `draft_alignment.mapping == {}` is correct behaviour, not a bug — the
  in-game top bar shows no names to match on.
- **In-game hero confidence runs low** (mean ~0.66; only ~20% of slots reach the 0.75
  `HERO_CONFIDENCE_THRESHOLD`), and no clean cutoff exists — a measured _wrong_ read scored 0.416
  while a _correct_ one scored 0.386. Don't add score gates; anchor on GSI, which knows the
  streamer's own hero exactly (`correctSelfHeroWithGsi` in `VisionResolver.ts`).
- **Draft rows in `processing_queue` are always `status='failed'`**, even when they succeed. Check
  `clip_results` for the real outcome.
- `- GLOBAL_DELAY` at the `scheduleClip` sites intentionally cancels the `+ GLOBAL_DELAY` inside
  `getStreamDelay()` — that 7s is for chat, not clips.

Debugging tools live in `scripts/clip-debug/` (`query_match.sh` for a match's full clip history,
`scan_clip.py` to see what a clip's frames actually contain plus the `STRATEGY TIME` countdown
that tells you where it landed). The **`dota-vision-roster-debug` skill** has the full workflow,
the DB/API recipes, and a list of plausible-sounding fixes that measurement has already
disproved — read it before changing clip timing or alignment code.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
