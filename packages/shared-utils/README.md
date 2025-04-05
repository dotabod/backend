# @dotabod/shared-utils

This package contains shared utilities used across multiple Dotabod packages to reduce code duplication.

## Installation

```bash
npm install @dotabod/shared-utils
```

## Usage

```typescript
// Import the utilities you need
import {
  logger,
  getTwitchAPI,
  checkBotStatus,
  getAuthProvider
} from '@dotabod/shared-utils'

// Use them in your code
const api = await getTwitchAPI('twitchUserId')
const isBotBanned = await checkBotStatus()
```

## Available Utilities

### Twitch Utilities

- `getAuthProvider` - Get a singleton instance of the Twitch auth provider
- `getTwitchAPI` - Get a Twitch API client for a specific user
- `getTwitchTokens` - Get Twitch tokens for a user from Supabase
- `checkBotStatus` - Check if the bot is banned from Twitch
- `hasTokens` - Check if Twitch credentials are available

### Database Utilities

- `getSupabaseClient` - Get a singleton instance of the Supabase client

### Logging

- `logger` - Pino logger instance for consistent logging across packages
