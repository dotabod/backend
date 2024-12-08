export interface TwitchConduitResponse {
  data: Array<{
    id: string
    shard_count: number
  }>
}

export interface TwitchConduitCreateResponse {
  data: Array<{
    /** Unique identifier for the created conduit */
    id: string
    /** Number of shards created for this conduit */
    shard_count: number
  }>
}

/**
 * Transport details for a conduit shard
 */
export interface TwitchConduitShardTransport {
  /** The transport method - either webhook or websocket */
  method: 'webhook' | 'websocket'
  /** The callback URL for webhook transport. Must use HTTPS and port 443 */
  callback?: string
  /** Secret used to verify webhook signatures. Must be 10-100 ASCII characters */
  secret?: string
  /** WebSocket session ID for websocket transport */
  session_id?: string
}

/**
 * Request body for updating conduit shards
 */
export interface TwitchConduitShardRequest {
  /** ID of the conduit to update */
  conduit_id: string
  /** List of shards to update */
  shards: Array<{
    /** Numeric shard ID */
    id: number
    /** Transport configuration for this shard */
    transport: TwitchConduitShardTransport
  }>
}

/**
 * Response from updating conduit shards
 */
export interface TwitchConduitShardResponse {
  /** List of successfully updated shards */
  data: Array<{
    /** Shard ID */
    id: string
    /** Current status of the shard */
    status:
      | 'enabled' // Shard is enabled and receiving events
      | 'webhook_callback_verification_pending' // Waiting for webhook URL verification
      | 'webhook_callback_verification_failed' // Webhook URL verification failed
      | 'notification_failures_exceeded' // Too many failed notification deliveries
      | 'websocket_disconnected' // Client closed connection
      | 'websocket_failed_ping_pong' // Client failed to respond to ping
      | 'websocket_received_inbound_traffic' // Client sent non-pong message
      | 'websocket_internal_error' // Server error
      | 'websocket_network_timeout' // Server write timeout
      | 'websocket_network_error' // Server network error
      | 'websocket_failed_to_reconnect' // Client failed to reconnect after Reconnect message
    /** Transport configuration for this shard */
    transport: {
      /** Transport method used */
      method: 'webhook' | 'websocket'
      /** Webhook callback URL if using webhook transport */
      callback?: string
      /** WebSocket session ID if using websocket transport */
      session_id?: string
      /** UTC timestamp when WebSocket connected */
      connected_at?: string
      /** UTC timestamp when WebSocket disconnected */
      disconnected_at?: string
    }
  }>
  /** List of shards that failed to update */
  errors?: Array<{
    /** ID of shard that failed */
    id: string
    /** Human readable error message */
    message: string
    /** Error code for the failure */
    code: string
  }>
}

export interface RevocationPayload {
  subscription: {
    id: string
    status: string
    type: string
    version: string
    condition: {
      broadcaster_user_id: string
      user_id: string
    }
    transport: {
      method: string
      conduit_id: string
    }
    created_at: string
    cost: number
  }
}
