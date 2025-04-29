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
