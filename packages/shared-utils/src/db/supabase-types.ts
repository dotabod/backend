export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          access_token: string
          created_at: string
          expires_at: number | null
          expires_in: number | null
          id: string
          id_token: string | null
          obtainment_timestamp: string | null
          provider: string
          providerAccountId: string
          refresh_token: string
          requires_refresh: boolean | null
          scope: string | null
          session_state: string | null
          token_type: string | null
          type: string
          updated_at: string
          userId: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: number | null
          expires_in?: number | null
          id?: string
          id_token?: string | null
          obtainment_timestamp?: string | null
          provider: string
          providerAccountId: string
          refresh_token: string
          requires_refresh?: boolean | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type: string
          updated_at?: string
          userId: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: number | null
          expires_in?: number | null
          id?: string
          id_token?: string | null
          obtainment_timestamp?: string | null
          provider?: string
          providerAccountId?: string
          refresh_token?: string
          requires_refresh?: boolean | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type?: string
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'accounts_userId_fkey'
            columns: ['userId']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      admin: {
        Row: {
          createdAt: string
          id: string
          role: string
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          id?: string
          role?: string
          updatedAt?: string
          userId: string
        }
        Update: {
          createdAt?: string
          id?: string
          role?: string
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      advanced_bets: {
        Row: {
          bet_type: string
          created_at: string
          data: Json | null
          id: number
          match_id: string
          outcome_1: string
          outcome_2: string
          predictionid: string | null
          title: string
          updated_at: string | null
          winning_outcome: number | null
        }
        Insert: {
          bet_type: string
          created_at?: string
          data?: Json | null
          id?: number
          match_id: string
          outcome_1: string
          outcome_2: string
          predictionid?: string | null
          title: string
          updated_at?: string | null
          winning_outcome?: number | null
        }
        Update: {
          bet_type?: string
          created_at?: string
          data?: Json | null
          id?: number
          match_id?: string
          outcome_1?: string
          outcome_2?: string
          predictionid?: string | null
          title?: string
          updated_at?: string | null
          winning_outcome?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'advanced_bets_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      approved_moderators: {
        Row: {
          created_at: string
          id: string
          moderatorChannelId: number
          updated_at: string
          userId: string
        }
        Insert: {
          created_at?: string
          id?: string
          moderatorChannelId: number
          updated_at?: string
          userId: string
        }
        Update: {
          created_at?: string
          id?: string
          moderatorChannelId?: number
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'approved_moderators_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      disable_notifications: {
        Row: {
          acknowledged: boolean
          auto_resolved: boolean
          created_at: string
          id: string
          metadata: Json | null
          reason: Database['public']['Enums']['DisableReason']
          resolved_at: string | null
          setting_key: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          auto_resolved?: boolean
          created_at?: string
          id?: string
          metadata?: Json | null
          reason: Database['public']['Enums']['DisableReason']
          resolved_at?: string | null
          setting_key: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          auto_resolved?: boolean
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: Database['public']['Enums']['DisableReason']
          resolved_at?: string | null
          setting_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'disable_notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      discord_accounts: {
        Row: {
          access_token: string
          created_at: string
          expires_in: number
          id: number
          providerAccountId: number
          refresh_token: string
          scope: string
          token_type: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_in: number
          id?: number
          providerAccountId: number
          refresh_token: string
          scope: string
          token_type: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_in?: number
          id?: number
          providerAccountId?: number
          refresh_token?: string
          scope?: string
          token_type?: string
        }
        Relationships: []
      }
      gift_subscriptions: {
        Row: {
          created_at: string
          gifterId: string | null
          giftMessage: string | null
          giftQuantity: number
          giftType: string
          id: string
          senderName: string
          subscriptionId: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gifterId?: string | null
          giftMessage?: string | null
          giftQuantity?: number
          giftType?: string
          id?: string
          senderName?: string
          subscriptionId: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gifterId?: string | null
          giftMessage?: string | null
          giftQuantity?: number
          giftType?: string
          id?: string
          senderName?: string
          subscriptionId?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'gift_subscriptions_subscriptionId_fkey'
            columns: ['subscriptionId']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      gift_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gifterId: string | null
          giftQuantity: number
          giftSubscriptionId: string
          giftType: string
          id: string
          metadata: Json | null
          recipientId: string
          stripeSessionId: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          gifterId?: string | null
          giftQuantity: number
          giftSubscriptionId: string
          giftType: string
          id?: string
          metadata?: Json | null
          recipientId: string
          stripeSessionId?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gifterId?: string | null
          giftQuantity?: number
          giftSubscriptionId?: string
          giftType?: string
          id?: string
          metadata?: Json | null
          recipientId?: string
          stripeSessionId?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'gift_transactions_giftSubscriptionId_fkey'
            columns: ['giftSubscriptionId']
            isOneToOne: false
            referencedRelation: 'gift_subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          dire_score: number | null
          game_mode: number | null
          hero_name: string | null
          hero_slot: number | null
          id: string
          is_doubledown: boolean
          is_party: boolean
          kda: Json | null
          lobby_type: number | null
          matchId: string
          myTeam: string
          predictionId: string | null
          radiant_score: number | null
          steam32Id: number | null
          updated_at: string
          userId: string
          won: boolean | null
        }
        Insert: {
          created_at?: string
          dire_score?: number | null
          game_mode?: number | null
          hero_name?: string | null
          hero_slot?: number | null
          id?: string
          is_doubledown?: boolean
          is_party?: boolean
          kda?: Json | null
          lobby_type?: number | null
          matchId: string
          myTeam: string
          predictionId?: string | null
          radiant_score?: number | null
          steam32Id?: number | null
          updated_at?: string
          userId: string
          won?: boolean | null
        }
        Update: {
          created_at?: string
          dire_score?: number | null
          game_mode?: number | null
          hero_name?: string | null
          hero_slot?: number | null
          id?: string
          is_doubledown?: boolean
          is_party?: boolean
          kda?: Json | null
          lobby_type?: number | null
          matchId?: string
          myTeam?: string
          predictionId?: string | null
          radiant_score?: number | null
          steam32Id?: number | null
          updated_at?: string
          userId?: string
          won?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'bets_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      MessageDelivery: {
        Row: {
          createdAt: string
          deliveredAt: string | null
          id: string
          scheduledMessageId: string
          status: Database['public']['Enums']['MessageStatus']
          updatedAt: string
          userId: string
        }
        Insert: {
          createdAt?: string
          deliveredAt?: string | null
          id?: string
          scheduledMessageId: string
          status?: Database['public']['Enums']['MessageStatus']
          updatedAt: string
          userId: string
        }
        Update: {
          createdAt?: string
          deliveredAt?: string | null
          id?: string
          scheduledMessageId?: string
          status?: Database['public']['Enums']['MessageStatus']
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'MessageDelivery_scheduledMessageId_fkey'
            columns: ['scheduledMessageId']
            isOneToOne: false
            referencedRelation: 'ScheduledMessage'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'MessageDelivery_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      mods: {
        Row: {
          created_at: string
          id: number
          mod_user_id: string | null
          streamer_user_id: string
          temp_mod_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          mod_user_id?: string | null
          streamer_user_id: string
          temp_mod_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          mod_user_id?: string | null
          streamer_user_id?: string
          temp_mod_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mods_mod_user_id_fkey'
            columns: ['mod_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mods_streamer_user_id_fkey'
            columns: ['streamer_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          giftSubscriptionId: string | null
          id: string
          isRead: boolean
          type: string
          updated_at: string
          userId: string
        }
        Insert: {
          created_at?: string
          giftSubscriptionId?: string | null
          id?: string
          isRead?: boolean
          type?: string
          updated_at?: string
          userId: string
        }
        Update: {
          created_at?: string
          giftSubscriptionId?: string | null
          id?: string
          isRead?: boolean
          type?: string
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_giftSubscriptionId_fkey'
            columns: ['giftSubscriptionId']
            isOneToOne: false
            referencedRelation: 'gift_subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      ScheduledMessage: {
        Row: {
          createdAt: string
          id: string
          isForAllUsers: boolean
          message: string
          sendAt: string
          status: Database['public']['Enums']['MessageStatus']
          updatedAt: string
          userId: string | null
        }
        Insert: {
          createdAt?: string
          id?: string
          isForAllUsers?: boolean
          message: string
          sendAt: string
          status?: Database['public']['Enums']['MessageStatus']
          updatedAt: string
          userId?: string | null
        }
        Update: {
          createdAt?: string
          id?: string
          isForAllUsers?: boolean
          message?: string
          sendAt?: string
          status?: Database['public']['Enums']['MessageStatus']
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ScheduledMessage_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      settings: {
        Row: {
          auto_disabled_at: string | null
          auto_disabled_by: string | null
          created_at: string
          disable_metadata: Json | null
          disable_reason: Database['public']['Enums']['DisableReason'] | null
          id: string
          key: string
          updated_at: string
          userId: string
          value: Json | null
        }
        Insert: {
          auto_disabled_at?: string | null
          auto_disabled_by?: string | null
          created_at?: string
          disable_metadata?: Json | null
          disable_reason?: Database['public']['Enums']['DisableReason'] | null
          id?: string
          key: string
          updated_at?: string
          userId: string
          value?: Json | null
        }
        Update: {
          auto_disabled_at?: string | null
          auto_disabled_by?: string | null
          created_at?: string
          disable_metadata?: Json | null
          disable_reason?: Database['public']['Enums']['DisableReason'] | null
          id?: string
          key?: string
          updated_at?: string
          userId?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'settings_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      steam_accounts: {
        Row: {
          connectedUserIds: string[] | null
          created_at: string
          id: string
          leaderboard_rank: number | null
          mmr: number
          name: string | null
          steam32Id: number
          updated_at: string
          userId: string
        }
        Insert: {
          connectedUserIds?: string[] | null
          created_at?: string
          id?: string
          leaderboard_rank?: number | null
          mmr?: number
          name?: string | null
          steam32Id: number
          updated_at?: string
          userId: string
        }
        Update: {
          connectedUserIds?: string[] | null
          created_at?: string
          id?: string
          leaderboard_rank?: number | null
          mmr?: number
          name?: string | null
          steam32Id?: number
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'steam_accounts_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      streams: {
        Row: {
          category_id: number | null
          category_name: string | null
          created_at: string
          followers: number | null
          id: string
          stream_delay: number | null
          stream_online: boolean
          stream_start_date: string | null
          title: string | null
          updated_at: string
          userId: string
        }
        Insert: {
          category_id?: number | null
          category_name?: string | null
          created_at?: string
          followers?: number | null
          id: string
          stream_delay?: number | null
          stream_online?: boolean
          stream_start_date?: string | null
          title?: string | null
          updated_at?: string
          userId: string
        }
        Update: {
          category_id?: number | null
          category_name?: string | null
          created_at?: string
          followers?: number | null
          id?: string
          stream_delay?: number | null
          stream_online?: boolean
          stream_start_date?: string | null
          title?: string | null
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'streams_userId_fkey'
            columns: ['userId']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelAtPeriodEnd: boolean
          created_at: string
          currentPeriodEnd: string | null
          id: string
          isGift: boolean
          metadata: Json | null
          status: Database['public']['Enums']['SubscriptionStatus'] | null
          stripeCustomerId: string | null
          stripePriceId: string | null
          stripeSubscriptionId: string | null
          tier: Database['public']['Enums']['SubscriptionTier']
          transactionType: Database['public']['Enums']['TransactionType']
          updated_at: string
          userId: string
        }
        Insert: {
          cancelAtPeriodEnd?: boolean
          created_at?: string
          currentPeriodEnd?: string | null
          id?: string
          isGift?: boolean
          metadata?: Json | null
          status?: Database['public']['Enums']['SubscriptionStatus'] | null
          stripeCustomerId?: string | null
          stripePriceId?: string | null
          stripeSubscriptionId?: string | null
          tier?: Database['public']['Enums']['SubscriptionTier']
          transactionType: Database['public']['Enums']['TransactionType']
          updated_at?: string
          userId: string
        }
        Update: {
          cancelAtPeriodEnd?: boolean
          created_at?: string
          currentPeriodEnd?: string | null
          id?: string
          isGift?: boolean
          metadata?: Json | null
          status?: Database['public']['Enums']['SubscriptionStatus'] | null
          stripeCustomerId?: string | null
          stripePriceId?: string | null
          stripeSubscriptionId?: string | null
          tier?: Database['public']['Enums']['SubscriptionTier']
          transactionType?: Database['public']['Enums']['TransactionType']
          updated_at?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_userId_fkey'
            columns: ['userId']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          beta_tester: boolean
          created_at: string
          displayName: string | null
          email: string | null
          emailVerified: string | null
          followers: number | null
          id: string
          image: string | null
          kick: number | null
          locale: string
          mmr: number
          name: string
          pro_expiration: string | null
          steam32Id: number | null
          stream_delay: number | null
          stream_online: boolean
          stream_start_date: string | null
          updated_at: string
          youtube: string | null
        }
        Insert: {
          beta_tester?: boolean
          created_at?: string
          displayName?: string | null
          email?: string | null
          emailVerified?: string | null
          followers?: number | null
          id?: string
          image?: string | null
          kick?: number | null
          locale?: string
          mmr?: number
          name?: string
          pro_expiration?: string | null
          steam32Id?: number | null
          stream_delay?: number | null
          stream_online?: boolean
          stream_start_date?: string | null
          updated_at?: string
          youtube?: string | null
        }
        Update: {
          beta_tester?: boolean
          created_at?: string
          displayName?: string | null
          email?: string | null
          emailVerified?: string | null
          followers?: number | null
          id?: string
          image?: string | null
          kick?: number | null
          locale?: string
          mmr?: number
          name?: string
          pro_expiration?: string | null
          steam32Id?: number | null
          stream_delay?: number | null
          stream_online?: boolean
          stream_start_date?: string | null
          updated_at?: string
          youtube?: string | null
        }
        Relationships: []
      }
      WebhookEvent: {
        Row: {
          eventType: string
          id: string
          processedAt: string
          stripeEventId: string
        }
        Insert: {
          eventType: string
          id: string
          processedAt: string
          stripeEventId: string
        }
        Update: {
          eventType?: string
          id?: string
          processedAt?: string
          stripeEventId?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_grouped_bets: {
        Args: { channel_id: string; start_date: string }
        Returns: {
          won: boolean
          lobby_type: number
          is_party: boolean
          is_doubledown: boolean
          _count_won: number
          _count_is_party: number
          _count_is_doubledown: number
        }[]
      }
    }
    Enums: {
      DisableReason:
        | 'TOKEN_REVOKED'
        | 'MANUAL_DISABLE'
        | 'STREAM_OFFLINE'
        | 'CHAT_PERMISSION_DENIED'
        | 'SUBSCRIPTION_INSUFFICIENT'
        | 'API_ERROR'
        | 'INVALID_TOKEN'
        | 'CACHE_CLEARED'
        | 'BOT_BANNED'
        | 'GAME_STATE'
        | 'RANK_RESTRICTION'
      MessageStatus: 'PENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED'
      SubscriptionStatus:
        | 'ACTIVE'
        | 'CANCELED'
        | 'INCOMPLETE'
        | 'INCOMPLETE_EXPIRED'
        | 'PAST_DUE'
        | 'PAUSED'
        | 'TRIALING'
        | 'UNPAID'
      SubscriptionTier: 'FREE' | 'PRO'
      TransactionType: 'RECURRING' | 'LIFETIME'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      DisableReason: [
        'TOKEN_REVOKED',
        'MANUAL_DISABLE',
        'STREAM_OFFLINE',
        'CHAT_PERMISSION_DENIED',
        'SUBSCRIPTION_INSUFFICIENT',
        'API_ERROR',
        'INVALID_TOKEN',
        'CACHE_CLEARED',
        'BOT_BANNED',
        'GAME_STATE',
        'RANK_RESTRICTION',
      ],
      MessageStatus: ['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED'],
      SubscriptionStatus: [
        'ACTIVE',
        'CANCELED',
        'INCOMPLETE',
        'INCOMPLETE_EXPIRED',
        'PAST_DUE',
        'PAUSED',
        'TRIALING',
        'UNPAID',
      ],
      SubscriptionTier: ['FREE', 'PRO'],
      TransactionType: ['RECURRING', 'LIFETIME'],
    },
  },
} as const
