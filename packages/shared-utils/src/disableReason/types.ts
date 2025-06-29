import type { Database, Json } from '../db/supabase-types.js'

export type DisableReason = Database['public']['Enums']['DisableReason']

// Make DisableReasonMetadata compatible with Json type from database
export interface DisableReasonMetadata extends Record<string, Json | undefined> {
  // Token revocation
  requires_reauth?: boolean

  // Manual disable
  disabled_by?: string
  command?: string

  // Stream state
  last_online?: string

  // Chat permissions
  drop_reason?: string
  permission_required?: string

  // Subscription
  required_tier?: string
  expires_at?: string
  current_tier?: string

  // API errors
  error_type?: string
  error_message?: string
  api_endpoint?: string

  // Cache clearing
  trigger?: string

  // Bot ban
  ban_detected_at?: string

  // Game state
  required_game_mode?: string
  current_game_mode?: string
  required_mmr?: number
  current_mmr?: number

  // Rank restriction
  minimum_rank?: string
  user_rank?: string
  minimum_rank_tier?: number
  user_rank_tier?: number

  // General
  additional_info?: string
}

// Use database types for disable notification data (with proper field names)
export type DisableNotificationData = {
  user_id: string
  setting_key: string
  reason: DisableReason
  metadata?: DisableReasonMetadata
  auto_resolved?: boolean
}

export interface ReasonContext {
  userId: string
  settingKey: string
  currentValue?: any
  previousValue?: any
  timestamp: Date
}
