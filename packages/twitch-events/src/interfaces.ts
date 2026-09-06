import type { TwitchEventTypes } from './twitch-event-types'

export interface TwitchEventSubCondition {
  broadcaster_user_id?: string
  client_id?: string
  user_id?: string
}

export interface TwitchEventSubResponse {
  // A list that contains the single subscription that you created
  data: {
    // An ID that identifies the subscription
    id: string
    // The subscription's status. Only enabled subscriptions receive events
    status: EventSubStatus
    // The subscription's type
    type: keyof TwitchEventTypes
    // Version number identifying this subscription definition
    version: string
    // Subscription parameter values as JSON object
    condition: TwitchEventSubCondition
    // Creation date/time in RFC3339 format
    created_at: string
    // Transport details for notifications
    transport: {
      // Transport method: 'webhook' | 'websocket' | 'conduit'
      method: string
      // Webhook callback URL (webhook only)
      callback?: string
      // WebSocket session ID (websocket only)
      session_id?: string
      // WebSocket connection time UTC (websocket only)
      connected_at?: string
      // Conduit ID for notifications (conduit only)
      conduit_id?: string
    }
    // Subscription cost against limit
    cost: number
  }[]
  // Total subscriptions created
  total: number
  // Sum of all subscription costs
  total_cost: number
  // Maximum allowed total cost
  max_total_cost: number
}

/** Status values for EventSub subscriptions */
export const EVENT_SUB_STATUSES = [
  'enabled',
  'webhook_callback_verification_pending',
  'webhook_callback_verification_failed',
  'notification_failures_exceeded',
  'authorization_revoked',
  'moderator_removed',
  'user_removed',
  'chat_user_banned',
  'version_removed',
  'beta_maintenance',
  'websocket_disconnected',
  'websocket_failed_ping_pong',
  'websocket_received_inbound_traffic',
  'websocket_connection_unused',
  'websocket_internal_error',
  'websocket_network_timeout',
  'websocket_network_error',
  'websocket_failed_to_reconnect',
] as const

export type EventSubStatus = (typeof EVENT_SUB_STATUSES)[number]
