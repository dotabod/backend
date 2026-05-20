# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Project Commands

- Build: `bun run build:all` or per package: `bun run --cwd packages/{package} build`
- Lint: `biome check .` or `bun run lint:all`
- Typecheck: `bun run typecheck:all`
- Test: `bun run --cwd packages/{package} test` or single test: `bun test packages/path/to/file.test.ts`

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

## CPU profile capture (Coolify)

Each service runs on Coolify with `bun --cpu-prof` gated by the `CPU_PROF` env var. Coolify app UUIDs: dota `i8gccg8`, twitch-events `zwg4g4c`, twitch-chat `zwgkg48`, steam `wsgwk8s`.

To capture: in Coolify → `<service>` app → set env `CPU_PROF=1` → Restart → let it serve traffic ~5 min → Stop (SIGTERM triggers `process.exit(0)`, bun flushes). Retrieve:

```sh
ssh oracle 'sudo cat /var/lib/docker/volumes/<uuid>-profiles/_data/CPU.*.cpuprofile' > svc.cpuprofile
```

Open in Chrome DevTools → Performance → Load profile. Source maps resolve frames to `src/...`. Set `CPU_PROF=` back to empty + Restart when done.

**Monitoring:** Services run with no in-container New Relic APM agent. Observability comes from the Oracle host `newrelic-infra` agent: `nri-docker` emits `ContainerSample` (CPU/mem/restart, faceted by `label.coolify.resourceName`) and host fluent-bit forwards container logs to NR with a `container_name` attribute.

**Rollback to a prior image:** look up a previous master digest with `gh api "/orgs/dotabod/packages/container/<service>/versions?per_page=5" --jq '.[] | select(.metadata.container.tags == ["master"]) | .name'`, then paste `sha256-<digest>` (dash, not colon) in Coolify's image tag/hash field and Redeploy.
