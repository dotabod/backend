// Database utilities
export { default as supabase, getSupabaseClient } from './db/supabase.js'
export type { Database, Tables } from './db/supabase-types.js'

// Disable reason tracking
export * from './disableReason/index.js'

// Logger
export { logger } from './logger.js'

// Bot status tracking
export { botStatus, checkBotStatus } from './twitch/botBanStatus.js'

// Conduit management
export {
  fetchConduitId,
  type TwitchConduitCreateResponse,
  type TwitchConduitResponse,
  updateConduitShard,
} from './twitch/conduitManager.js'

// Twitch utilities
export { getAuthProvider } from './twitch/getAuthProvider.js'
export { getTwitchAPI } from './twitch/getTwitchAPI.js'
export { getTwitchHeaders } from './twitch/getTwitchHeaders.js'
export { getTwitchTokens, type TwitchTokens } from './twitch/getTwitchTokens.js'
export { hasTokens } from './twitch/hasTokens.js'
