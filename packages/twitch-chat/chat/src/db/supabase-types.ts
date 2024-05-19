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
      bets: {
        Row: {
          created_at: string
          dire_score: number | null
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
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          userId: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          userId: string
          value?: Json | null
        }
        Update: {
          created_at?: string
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
          steam32Id?: number | null
          stream_delay?: number | null
          stream_online?: boolean
          stream_start_date?: string | null
          updated_at?: string
          youtube?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_grouped_bets: {
        Args: {
          channel_id: string
          start_date: string
        }
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database['public']['Tables'] & Database['public']['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database['public']['Tables'] &
        Database['public']['Views'])
    ? (Database['public']['Tables'] &
        Database['public']['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof Database['public']['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database['public']['Tables']
    ? Database['public']['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof Database['public']['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database['public']['Tables']
    ? Database['public']['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends keyof Database['public']['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof Database['public']['Enums']
    ? Database['public']['Enums'][PublicEnumNameOrOptions]
    : never
