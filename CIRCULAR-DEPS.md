# Circular Dependency Detector

This tool helps identify circular dependencies in the codebase, which can lead to various issues including:

- Difficulty understanding and maintaining the code
- Potential memory leaks
- Initialization order problems
- Slower build times

## Usage

```bash
# Run with Bun
./detect-circular-deps.ts

# Or explicitly with Bun
bun detect-circular-deps.ts
```

## How It Works

The script analyzes the import statements in all TypeScript and JavaScript files within the `packages/` directory. It:

1. Builds a dependency graph between files
2. Uses depth-first search to detect cycles in the graph
3. Reports all discovered circular dependencies
4. Provides a summary of circular dependencies grouped by package

## Fixing Circular Dependencies

When circular dependencies are found, consider these strategies to resolve them:

1. **Extract Shared Code**: Move the shared functionality to a new module that both original modules can import.
2. **Dependency Inversion**: Create an interface that both modules can use.
3. **Restructure Components**: Consider if your component architecture can be reorganized.
4. **Use Dynamic Imports**: In some cases, using dynamic imports can break cycles.

## Example Output

```
Scanning for circular dependencies...
Scanned 250 files and found 236 with dependencies.
Found 3 circular dependencies:
--------------------------------------------------------------------------------
1. Circular dependency involving packages/dota/src/dota/server.ts:
   packages/dota/src/dota/server.ts → packages/dota/src/dota/clearCacheForUser.ts → packages/dota/src/dota/server.ts
--------------------------------------------------------------------------------
2. Circular dependency involving packages/dota/src/db/watcher.ts:
   packages/dota/src/db/watcher.ts → packages/dota/src/dota/clearCacheForUser.ts → packages/dota/src/db/watcher.ts
--------------------------------------------------------------------------------
3. Circular dependency involving packages/shared-utils/src/index.ts:
   packages/shared-utils/src/index.ts → packages/shared-utils/src/logger.ts → packages/shared-utils/src/index.ts
--------------------------------------------------------------------------------
Circular dependencies by package:
- dota: 2 circular dependencies
- shared-utils: 1 circular dependencies
Analysis completed in 0.534 seconds.
