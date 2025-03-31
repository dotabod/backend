import type { TwitchEventTypes } from './TwitchEventTypes.js'
export interface TwitchConduitResponse {
  data: Array<{
    /** Unique identifier for the conduit */
    id: string
    /** Number of shards associated with this conduit */
    shard_count: number
  }>
}

export interface TwitchEventSubResponse {
  // A list that contains the single subscription that you created
  data: Array<{
    // An ID that identifies the subscription
    id: string
    // The subscription's status. Only enabled subscriptions receive events
    status: EventSubStatus
    // The subscription's type
    type: keyof TwitchEventTypes
    // Version number identifying this subscription definition
    version: string
    // Subscription parameter values as JSON object
    condition: Record<string, unknown>
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
  }>
  // Total subscriptions created
  total: number
  // Sum of all subscription costs
  total_cost: number
  // Maximum allowed total cost
  max_total_cost: number
}

/** Transport details for EventSub notifications */
export interface TwitchEventSubSubscriptionTransport {
  /** The transport method - either webhook or websocket */
  method: 'webhook' | 'websocket'
  /** The callback URL where notifications are sent (webhook only) */
  callback?: string
  /** WebSocket session ID for receiving notifications (websocket only) */
  session_id?: string
  /** UTC timestamp when WebSocket connected (websocket only) */
  connected_at?: string
  /** UTC timestamp when WebSocket disconnected (websocket only) */
  disconnected_at?: string
}

/** Status values for EventSub subscriptions */
export type EventSubStatus =
  | 'enabled'
  | 'webhook_callback_verification_pending'
  | 'webhook_callback_verification_failed'
  | 'notification_failures_exceeded'
  | 'authorization_revoked'
  | 'moderator_removed'
  | 'user_removed'
  | 'chat_user_banned'
  | 'version_removed'
  | 'beta_maintenance'
  | 'websocket_disconnected'
  | 'websocket_failed_ping_pong'
  | 'websocket_received_inbound_traffic'
  | 'websocket_connection_unused'
  | 'websocket_internal_error'
  | 'websocket_network_timeout'
  | 'websocket_network_error'
  | 'websocket_failed_to_reconnect'

/** Individual EventSub subscription */
export interface TwitchEventSubSubscription {
  /** Unique identifier for this subscription */
  id: string
  /** Current status of the subscription */
  status: EventSubStatus
  /** Type of subscription (e.g. channel.follow) */
  type: keyof TwitchEventTypes
  /** Version of the subscription type */
  version: string
  /** Subscription-specific parameters */
  condition: Record<string, unknown>
  /** RFC3339 timestamp when subscription was created */
  created_at: string
  /** Transport configuration for notifications */
  transport: TwitchEventSubSubscriptionTransport
  /** Cost against subscription limit */
  cost: number
}

/** Response from getting EventSub subscriptions */
export interface TwitchEventSubSubscriptionsResponse {
  /** List of subscriptions, ordered by oldest first */
  data: TwitchEventSubSubscription[]
  /** Total number of subscriptions created */
  total: number
  /** Total cost of all subscriptions */
  total_cost: number
  /** Maximum allowed total cost */
  max_total_cost: number
  /** Pagination details */
  pagination?: {
    /** Cursor for getting next page of results */
    cursor?: string
  }
}
