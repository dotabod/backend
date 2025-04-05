# Migration Guide: Using @dotabod/shared-utils

This guide shows how to migrate from local utility implementations to the shared utilities package.

## Installation

1. Add the shared-utils package to your package.json:

```json
"dependencies": {
  "@dotabod/shared-utils": "workspace:*"
}
```

2. Rebuild your project:

```bash
bun install
```

## Common Migrations

### Twitch API and Authentication

Replace:
```typescript
import { getTwitchAPI } from '../lib/getTwitchAPI.js'
import { getAuthProvider } from '../lib/getAuthProvider.js'
import { checkBotStatus } from '../lib/botBanStatus.js'
```

With:
```typescript
import { getTwitchAPI, getAuthProvider, checkBotStatus } from '@dotabod/shared-utils'
```

### Logging

Replace:
```typescript
import { logger } from '../../utils/logger.js'
```

With:
```typescript
import { logger } from '@dotabod/shared-utils'
```

### Database Access

Replace:
```typescript
import supabase from '../db/supabase.js'
```

With:
```typescript
import { getSupabaseClient } from '@dotabod/shared-utils'

const supabase = getSupabaseClient()
```

## Files to Remove

After migrating to shared utilities, you can remove these files from your packages:

- `src/twitch/lib/getAuthProvider.ts`
- `src/twitch/lib/getTwitchAPI.ts`
- `src/twitch/lib/botBanStatus.ts`
- `src/twitch/lib/getTwitchTokens.ts`
- `src/twitch/lib/hasTokens.ts`
- `src/db/supabase.ts` (if you were using direct Supabase client)
- `src/utils/logger.ts` (if you migrate to the shared logger)

## Troubleshooting

If you encounter TypeScript errors after migration:

1. Make sure your `tsconfig.json` is properly configured to find the shared package
2. Run `bun install` to rebuild node_modules
3. Check that import paths are correct with `.js` extensions where needed
