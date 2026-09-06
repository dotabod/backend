/**
 * Checks if required Twitch credentials are set in the environment
 */
export const hasTokens =
  process.env.TWITCH_CLIENT_ID !== undefined &&
  process.env.TWITCH_CLIENT_ID.length > 0 &&
  process.env.TWITCH_CLIENT_SECRET !== undefined &&
  process.env.TWITCH_CLIENT_SECRET.length > 0
