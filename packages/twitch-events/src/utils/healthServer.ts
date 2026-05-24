import { logger } from '@dotabod/shared-utils'
import express from 'express'
import { eventsIOConnected } from './socketUtils'

// Preserve the module-load env guard that lived in the deleted webhookUtils.ts.
// BotApiSingleton silently falls back to `?? ''` if this is unset, which masks
// a misconfigured deploy until the first real Twitch API call returns 401.
if (!process.env.TWITCH_CLIENT_ID) {
  throw new Error('TWITCH_CLIENT_ID is not defined')
}

// Slim HTTP liveness endpoint. Replaces the legacy webhookUtils.ts which
// also hosted a Supabase Database Webhook POST receiver — that receiver
// has been retired in favor of the Supabase Realtime watcher in
// `packages/twitch-events/src/watcher.ts`.
//
// Uptime Kuma hits GET /webhook for liveness; `eventsConnected` reflects
// whether twitch-chat is connected via socket.io and forwarding events.
// Keeping the path `/webhook` for backwards compatibility with existing
// monitor configurations.
export const setupHealthServer = (): void => {
  const app = express()

  app.get('/webhook', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      eventsConnected: eventsIOConnected,
    })
  })

  const server = app.listen(5011, () => {
    logger.info('[TWITCHEVENTS] Health server listening on port 5011')
  })
  server.on('error', (error) => {
    logger.error('[TWITCHEVENTS] Health server failed to bind port 5011', { error })
    throw error
  })
}
