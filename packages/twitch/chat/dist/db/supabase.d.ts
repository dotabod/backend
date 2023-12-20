import { Database } from './supabase-types';
declare const supabase: import("@supabase/supabase-js").SupabaseClient<Database, "public", {
    Tables: {
        accounts: {
            Row: {
                access_token: string;
                created_at: string;
                expires_at: number | null;
                expires_in: number | null;
                id: string;
                id_token: string | null;
                obtainment_timestamp: string | null;
                provider: string;
                providerAccountId: string;
                refresh_token: string;
                requires_refresh: boolean | null;
                scope: string | null;
                session_state: string | null;
                token_type: string | null;
                type: string;
                updated_at: string;
                userId: string;
            };
            Insert: {
                access_token: string;
                created_at?: string | undefined;
                expires_at?: number | null | undefined;
                expires_in?: number | null | undefined;
                id?: string | undefined;
                id_token?: string | null | undefined;
                obtainment_timestamp?: string | null | undefined;
                provider: string;
                providerAccountId: string;
                refresh_token: string;
                requires_refresh?: boolean | null | undefined;
                scope?: string | null | undefined;
                session_state?: string | null | undefined;
                token_type?: string | null | undefined;
                type: string;
                updated_at?: string | undefined;
                userId: string;
            };
            Update: {
                access_token?: string | undefined;
                created_at?: string | undefined;
                expires_at?: number | null | undefined;
                expires_in?: number | null | undefined;
                id?: string | undefined;
                id_token?: string | null | undefined;
                obtainment_timestamp?: string | null | undefined;
                provider?: string | undefined;
                providerAccountId?: string | undefined;
                refresh_token?: string | undefined;
                requires_refresh?: boolean | null | undefined;
                scope?: string | null | undefined;
                session_state?: string | null | undefined;
                token_type?: string | null | undefined;
                type?: string | undefined;
                updated_at?: string | undefined;
                userId?: string | undefined;
            };
            Relationships: [{
                foreignKeyName: "accounts_userId_fkey";
                columns: ["userId"];
                isOneToOne: true;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        bets: {
            Row: {
                created_at: string;
                dire_score: number | null;
                hero_name: string | null;
                hero_slot: number | null;
                id: string;
                is_doubledown: boolean;
                is_party: boolean;
                kda: import("./supabase-types").Json;
                lobby_type: number | null;
                matchId: string;
                myTeam: string;
                predictionId: string;
                radiant_score: number | null;
                steam32Id: number | null;
                updated_at: string;
                userId: string;
                won: boolean | null;
            };
            Insert: {
                created_at?: string | undefined;
                dire_score?: number | null | undefined;
                hero_name?: string | null | undefined;
                hero_slot?: number | null | undefined;
                id?: string | undefined;
                is_doubledown?: boolean | undefined;
                is_party?: boolean | undefined;
                kda?: import("./supabase-types").Json | undefined;
                lobby_type?: number | null | undefined;
                matchId: string;
                myTeam: string;
                predictionId: string;
                radiant_score?: number | null | undefined;
                steam32Id?: number | null | undefined;
                updated_at?: string | undefined;
                userId: string;
                won?: boolean | null | undefined;
            };
            Update: {
                created_at?: string | undefined;
                dire_score?: number | null | undefined;
                hero_name?: string | null | undefined;
                hero_slot?: number | null | undefined;
                id?: string | undefined;
                is_doubledown?: boolean | undefined;
                is_party?: boolean | undefined;
                kda?: import("./supabase-types").Json | undefined;
                lobby_type?: number | null | undefined;
                matchId?: string | undefined;
                myTeam?: string | undefined;
                predictionId?: string | undefined;
                radiant_score?: number | null | undefined;
                steam32Id?: number | null | undefined;
                updated_at?: string | undefined;
                userId?: string | undefined;
                won?: boolean | null | undefined;
            };
            Relationships: [{
                foreignKeyName: "bets_userId_fkey";
                columns: ["userId"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        mods: {
            Row: {
                created_at: string;
                id: number;
                mod_user_id: string | null;
                streamer_user_id: string;
                temp_mod_name: string | null;
                updated_at: string;
            };
            Insert: {
                created_at?: string | undefined;
                id?: number | undefined;
                mod_user_id?: string | null | undefined;
                streamer_user_id: string;
                temp_mod_name?: string | null | undefined;
                updated_at?: string | undefined;
            };
            Update: {
                created_at?: string | undefined;
                id?: number | undefined;
                mod_user_id?: string | null | undefined;
                streamer_user_id?: string | undefined;
                temp_mod_name?: string | null | undefined;
                updated_at?: string | undefined;
            };
            Relationships: [{
                foreignKeyName: "mods_mod_user_id_fkey";
                columns: ["mod_user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "mods_streamer_user_id_fkey";
                columns: ["streamer_user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        settings: {
            Row: {
                created_at: string;
                id: string;
                key: string;
                updated_at: string;
                userId: string;
                value: import("./supabase-types").Json;
            };
            Insert: {
                created_at?: string | undefined;
                id?: string | undefined;
                key: string;
                updated_at?: string | undefined;
                userId: string;
                value?: import("./supabase-types").Json | undefined;
            };
            Update: {
                created_at?: string | undefined;
                id?: string | undefined;
                key?: string | undefined;
                updated_at?: string | undefined;
                userId?: string | undefined;
                value?: import("./supabase-types").Json | undefined;
            };
            Relationships: [{
                foreignKeyName: "settings_userId_fkey";
                columns: ["userId"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        steam_accounts: {
            Row: {
                connectedUserIds: string[] | null;
                created_at: string;
                id: string;
                leaderboard_rank: number | null;
                mmr: number;
                name: string | null;
                steam32Id: number;
                updated_at: string;
                userId: string;
            };
            Insert: {
                connectedUserIds?: string[] | null | undefined;
                created_at?: string | undefined;
                id?: string | undefined;
                leaderboard_rank?: number | null | undefined;
                mmr?: number | undefined;
                name?: string | null | undefined;
                steam32Id: number;
                updated_at?: string | undefined;
                userId: string;
            };
            Update: {
                connectedUserIds?: string[] | null | undefined;
                created_at?: string | undefined;
                id?: string | undefined;
                leaderboard_rank?: number | null | undefined;
                mmr?: number | undefined;
                name?: string | null | undefined;
                steam32Id?: number | undefined;
                updated_at?: string | undefined;
                userId?: string | undefined;
            };
            Relationships: [{
                foreignKeyName: "steam_accounts_userId_fkey";
                columns: ["userId"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        streams: {
            Row: {
                category_id: number | null;
                category_name: string | null;
                created_at: string;
                followers: number | null;
                id: string;
                stream_delay: number | null;
                stream_online: boolean;
                stream_start_date: string | null;
                title: string | null;
                updated_at: string;
                userId: string;
            };
            Insert: {
                category_id?: number | null | undefined;
                category_name?: string | null | undefined;
                created_at?: string | undefined;
                followers?: number | null | undefined;
                id: string;
                stream_delay?: number | null | undefined;
                stream_online?: boolean | undefined;
                stream_start_date?: string | null | undefined;
                title?: string | null | undefined;
                updated_at?: string | undefined;
                userId: string;
            };
            Update: {
                category_id?: number | null | undefined;
                category_name?: string | null | undefined;
                created_at?: string | undefined;
                followers?: number | null | undefined;
                id?: string | undefined;
                stream_delay?: number | null | undefined;
                stream_online?: boolean | undefined;
                stream_start_date?: string | null | undefined;
                title?: string | null | undefined;
                updated_at?: string | undefined;
                userId?: string | undefined;
            };
            Relationships: [{
                foreignKeyName: "streams_userId_fkey";
                columns: ["userId"];
                isOneToOne: true;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        users: {
            Row: {
                beta_tester: boolean;
                created_at: string;
                displayName: string | null;
                email: string | null;
                emailVerified: string | null;
                followers: number | null;
                id: string;
                image: string | null;
                kick: number | null;
                locale: string;
                mmr: number;
                name: string;
                steam32Id: number | null;
                stream_delay: number | null;
                stream_online: boolean;
                stream_start_date: string | null;
                updated_at: string;
                youtube: string | null;
            };
            Insert: {
                beta_tester?: boolean | undefined;
                created_at?: string | undefined;
                displayName?: string | null | undefined;
                email?: string | null | undefined;
                emailVerified?: string | null | undefined;
                followers?: number | null | undefined;
                id?: string | undefined;
                image?: string | null | undefined;
                kick?: number | null | undefined;
                locale?: string | undefined;
                mmr?: number | undefined;
                name?: string | undefined;
                steam32Id?: number | null | undefined;
                stream_delay?: number | null | undefined;
                stream_online?: boolean | undefined;
                stream_start_date?: string | null | undefined;
                updated_at?: string | undefined;
                youtube?: string | null | undefined;
            };
            Update: {
                beta_tester?: boolean | undefined;
                created_at?: string | undefined;
                displayName?: string | null | undefined;
                email?: string | null | undefined;
                emailVerified?: string | null | undefined;
                followers?: number | null | undefined;
                id?: string | undefined;
                image?: string | null | undefined;
                kick?: number | null | undefined;
                locale?: string | undefined;
                mmr?: number | undefined;
                name?: string | undefined;
                steam32Id?: number | null | undefined;
                stream_delay?: number | null | undefined;
                stream_online?: boolean | undefined;
                stream_start_date?: string | null | undefined;
                updated_at?: string | undefined;
                youtube?: string | null | undefined;
            };
            Relationships: [];
        };
    };
    Views: {};
    Functions: {
        get_grouped_bets: {
            Args: {
                channel_id: string;
                start_date: string;
            };
            Returns: {
                won: boolean;
                lobby_type: number;
                is_party: boolean;
                is_doubledown: boolean;
                _count_won: number;
                _count_is_party: number;
                _count_is_doubledown: number;
            }[];
        };
    };
    Enums: {};
    CompositeTypes: {};
}>;
export default supabase;
//# sourceMappingURL=supabase.d.ts.map