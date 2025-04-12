// Logger
export { logger } from './logger.js'

// Database utilities
export { getSupabaseClient } from './db/supabase.js'
export { default as supabase } from './db/supabase.js'
export type { Database } from './db/supabase-types.js'
export type { Tables } from './db/supabase-types.js'
// Twitch utilities
export { getAuthProvider } from './twitch/getAuthProvider.js'
export { getTwitchAPI } from './twitch/getTwitchAPI.js'
export { getTwitchTokens, type TwitchTokens } from './twitch/getTwitchTokens.js'
export { hasTokens } from './twitch/hasTokens.js'
export { getTwitchHeaders } from './twitch/getTwitchHeaders.js'

// Bot status tracking
export { botStatus, checkBotStatus } from './twitch/botBanStatus.js'

// Conduit management
export {
  fetchConduitId,
  updateConduitShard,
  type TwitchConduitResponse,
  type TwitchConduitCreateResponse,
} from './twitch/conduitManager.js'
