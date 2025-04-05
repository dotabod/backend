/**
 * Checks if required Twitch credentials are set in the environment
 */
export const hasTokens = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)
