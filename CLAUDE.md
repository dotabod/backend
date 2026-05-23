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

To capture: in Coolify → `<service>` app → set env `CPU_PROF=1` → Restart → let it serve traffic ~5 min → Stop (SIGTERM triggers `process.exit(0)`, node flushes). Retrieve:

```sh
ssh oracle 'sudo cat /var/lib/docker/volumes/<uuid>-profiles/_data/CPU.*.cpuprofile' > svc.cpuprofile
```

Open in Chrome DevTools → Performance → Load profile. Source maps resolve frames to `src/...`. Set `CPU_PROF=` back to empty + Restart when done.

**Monitoring — why no in-container New Relic APM agent:** The Node APM agent (loaded via `-r newrelic`) burned excessive CPU for little benefit — dota alone sat at ~40% container CPU emitting ~540k APM datapoints/30min — so it was removed in 2026-05. Observability now comes entirely from the Oracle host `newrelic-infra` agent: `nri-docker` emits `ContainerSample` (CPU/mem/restart, faceted by `label.coolify.resourceName`) and host fluent-bit forwards container logs to NR with a `container_name` attribute. Tradeoff: we lost APM-only HTTP signals (response time, apdex, throughput, transaction error rate) with no host equivalent — backend alerts/dashboards were migrated to `ContainerSample`/`Log` queries accordingly. Do NOT re-add the `newrelic` package or `-r newrelic` to the services.

**Rollback to a prior image:** look up a previous master digest with `gh api "/orgs/dotabod/packages/container/<service>/versions?per_page=5" --jq '.[] | select(.metadata.container.tags == ["master"]) | .name'`, then paste `sha256-<digest>` (dash, not colon) in Coolify's image tag/hash field and Redeploy.

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
