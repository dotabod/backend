import { HeroNames } from '../getHero.js';
export interface SocketClient {
    name: string;
    token: string;
    stream_online: boolean;
    stream_start_date: Date | null;
    beta_tester: boolean;
    locale: string;
    multiAccount?: number;
    steam32Id: number | null;
    mmr: number;
    gsi?: Packet;
    Account: {
        refresh_token: string;
        access_token: string;
        expires_at: number | null;
        scope: string | null;
        obtainment_timestamp: Date | null;
        expires_in: number | null;
        providerAccountId: string;
    } | null;
    SteamAccount: {
        mmr: number;
        leaderboard_rank: number | null;
        name: string | null;
        steam32Id: number;
    }[];
    settings: {
        key: string;
        value: any;
    }[];
}
interface Provider {
    name: string;
    appid: number;
    version: number;
    timestamp: number;
}
export interface MapData {
    name: string;
    matchid: string;
    game_time: number;
    clock_time: number;
    daytime: boolean;
    nightstalker_night: boolean;
    radiant_score: number;
    dire_score: number;
    game_state: string;
    paused: boolean;
    win_team: string;
    customgamename: string;
    ward_purchase_cooldown: number;
}
export interface Wearables {
    wearable0: number;
    wearable1: number;
    wearable2: number;
    wearable3: number;
    wearable4: number;
    wearable5: number;
    wearable6: number;
    wearable7: number;
    wearable8: number;
    wearable9: number;
    wearable10: number;
    wearable11: number;
}
export interface Entity {
    xpos: number;
    ypos: number;
    image: string;
    team: number;
    yaw: number;
    unitname: string;
    visionrange: number;
    name?: string;
    eventduration?: number;
    yposP?: string;
    xposP?: string;
    teamP?: string;
}
export type Minimap = Record<string, Entity>;
export interface Player {
    team2?: {
        player0: Player;
        player1: Player;
        player2: Player;
        player3: Player;
        player4: Player;
    };
    team3?: {
        player5: Player;
        player6: Player;
        player7: Player;
        player8: Player;
        player9: Player;
    };
    id?: number;
    steamid: string;
    accountid: string;
    name: string;
    activity: string;
    kills: number;
    deaths: number;
    assists: number;
    last_hits: number;
    denies: number;
    kill_streak: number;
    commands_issued: number;
    kill_list: Record<string, number>;
    team_name: 'spectator' | 'radiant' | 'dire';
    gold: number;
    gold_reliable: number;
    gold_unreliable: number;
    gold_from_hero_kills: number;
    gold_from_creep_kills: number;
    gold_from_income: number;
    gold_from_shared: number;
    gpm: number;
    xpm: number;
    net_worth: number;
    hero_damage: number;
    tower_damage: number;
    wards_purchased: number;
    wards_placed: number;
    wards_destroyed: number;
    runes_activated: number;
    camps_stacked: number;
    support_gold_spent: number;
    consumable_gold_spent: number;
    item_gold_spent: number;
    gold_lost_to_death: number;
    gold_spent_on_buybacks: number;
}
export interface Hero {
    team2?: {
        player0: Hero;
        player1: Hero;
        player2: Hero;
        player3: Hero;
        player4: Hero;
    };
    team3?: {
        player5: Hero;
        player6: Hero;
        player7: Hero;
        player8: Hero;
        player9: Hero;
    };
    id: number;
    name?: HeroNames;
    xpos?: number;
    ypos?: number;
    level?: number;
    xp?: number;
    alive?: boolean;
    respawn_seconds?: number;
    buyback_cost?: number;
    buyback_cooldown?: number;
    health?: number;
    max_health?: number;
    health_percent?: number;
    mana?: number;
    max_mana?: number;
    mana_percent?: number;
    silenced?: boolean;
    stunned?: boolean;
    disarmed?: boolean;
    magicimmune?: boolean;
    hexed?: boolean;
    muted?: boolean;
    break?: boolean;
    aghanims_scepter?: boolean;
    aghanims_shard?: boolean;
    smoked?: boolean;
    has_debuff?: boolean;
    selected_unit?: boolean;
    talent_1?: boolean;
    talent_2?: boolean;
    talent_3?: boolean;
    talent_4?: boolean;
    talent_5?: boolean;
    talent_6?: boolean;
    talent_7?: boolean;
    talent_8?: boolean;
}
export interface Abilities {
    ability0?: Ability;
    ability1?: Ability;
    ability2?: Ability;
    ability3?: Ability;
    ability4?: Ability;
    ability5?: Ability;
    ability6?: Ability;
    ability7?: Ability;
    ability8?: Ability;
    ability9?: Ability;
    ability10?: Ability;
    ability11?: Ability;
    ability12?: Ability;
    ability13?: Ability;
    ability14?: Ability;
    ability15?: Ability;
    ability16?: Ability;
    ability17?: Ability;
    ability18?: Ability;
    ability19?: Ability;
}
export interface Ability {
    name: string;
    level: number;
    can_cast: boolean;
    passive: boolean;
    ability_active: boolean;
    cooldown: number;
    ultimate: boolean;
    charges: number;
    max_charges: number;
    charge_cooldown: number;
}
export interface Items {
    team2?: {
        player0: Items;
        player1: Items;
        player2: Items;
        player3: Items;
        player4: Items;
    };
    team3?: {
        player5: Items;
        player6: Items;
        player7: Items;
        player8: Items;
        player9: Items;
    };
    slot0?: Item;
    slot1?: Item;
    slot2?: Item;
    slot3?: Item;
    slot4?: Item;
    slot5?: Item;
    slot6?: Item;
    slot7?: Item;
    slot8?: Item;
    stash0?: Item;
    stash1?: Item;
    stash2?: Item;
    stash3?: Item;
    stash4?: Item;
    stash5?: Item;
    teleport0?: Item;
    neutral0?: Item;
}
export interface Item {
    name: string;
    purchaser?: number;
    can_cast?: boolean;
    cooldown?: number;
    item_level?: number;
    passive: boolean;
    charges?: number;
}
interface Buildings {
    dota_badguys_tower1_top: Building;
    dota_badguys_tower2_top: Building;
    dota_badguys_tower3_top: Building;
    dota_badguys_tower1_mid: Building;
    dota_badguys_tower2_mid: Building;
    dota_badguys_tower3_mid: Building;
    dota_badguys_tower1_bot: Building;
    dota_badguys_tower2_bot: Building;
    dota_badguys_tower3_bot: Building;
    dota_badguys_tower4_top: Building;
    dota_badguys_tower4_bot: Building;
    bad_rax_melee_top: Building;
    bad_rax_range_top: Building;
    bad_rax_melee_mid: Building;
    bad_rax_range_mid: Building;
    bad_rax_melee_bot: Building;
    bad_rax_range_bot: Building;
    dota_badguys_fort: Building;
}
interface Building {
    health: number;
    max_health: number;
}
interface Draft {
    activeteam: number;
    pick: boolean;
    activeteam_time_remaining: number;
    radiant_bonus_time: number;
    dire_bonus_time: number;
    team2: TeamDraft;
    team3: TeamDraft;
}
interface TeamDraft {
    pick0_id: number;
    pick0_class: string;
    pick1_id: number;
    pick1_class: string;
    pick2_id: number;
    pick2_class: string;
    pick3_id: number;
    pick3_class: string;
    pick4_id: number;
    pick4_class: string;
    ban0_id: number;
    ban0_class: string;
    ban1_id: number;
    ban1_class: string;
    ban2_id: number;
    ban2_class: string;
    ban3_id: number;
    ban3_class: string;
    ban4_id: number;
    ban4_class: string;
    ban5_id: number;
    ban5_class: string;
    ban6_id: number;
    ban6_class: string;
}
export declare enum DotaEventTypes {
    RoshanKilled = "roshan_killed",
    AegisPickedUp = "aegis_picked_up",
    AegisDenied = "aegis_denied",
    Tip = "tip",
    BountyPickup = "bounty_rune_pickup",
    CourierKilled = "courier_killed"
}
export declare const validEventTypes: Set<DotaEventTypes>;
export interface DotaEvent {
    game_time: number;
    event_type: DotaEventTypes;
    sender_player_id: number;
    receiver_player_id: number;
    tip_amount: number;
    courier_team: string;
    killer_player_id: number;
    owning_player_id: number;
    player_id: number;
    team: string;
    bounty_value: number;
    team_gold: number;
    killed_by_team: 'dire';
    snatched: false;
}
/**
 *
 * Dump elements that are not matching data structure....
 *
 */
export interface Packet {
    provider: Provider;
    map?: MapData;
    player?: Player;
    minimap?: Minimap;
    hero?: Hero;
    abilities?: Abilities;
    items?: Items;
    buildings?: {
        radiant?: Buildings;
        dire?: Buildings;
    };
    draft?: Draft;
    events?: DotaEvent[];
    previously?: Omit<Packet, 'previously'> & {
        map: MapData | boolean;
    };
    added?: Omit<Packet, 'added'>;
}
export interface GCMatchData {
    result: number;
    match?: Match;
    vote: number;
}
export interface Match {
    duration: number;
    starttime: number;
    players: Player[];
    match_id: ID;
    tower_status: number[];
    barracks_status: number[];
    cluster: number;
    first_blood_time: number;
    replay_salt: number;
    server_ip: null;
    server_port: null;
    lobby_type: number;
    human_players: number;
    average_skill: null;
    game_balance: null;
    radiant_team_id: null;
    dire_team_id: null;
    leagueid: number;
    radiant_team_name: null;
    dire_team_name: null;
    radiant_team_logo: null;
    dire_team_logo: null;
    radiant_team_logo_url: null;
    dire_team_logo_url: null;
    radiant_team_complete: null;
    dire_team_complete: null;
    positive_votes: number;
    negative_votes: number;
    game_mode: number;
    picks_bans: any[];
    match_seq_num: null;
    replay_state: number;
    radiant_guild_id: null;
    dire_guild_id: null;
    radiant_team_tag: null;
    dire_team_tag: null;
    series_id: number;
    series_type: number;
    broadcaster_channels: any[];
    engine: number;
    custom_game_data: null;
    match_flags: number;
    private_metadata_key: null;
    radiant_team_score: number;
    dire_team_score: number;
    match_outcome: number;
    tournament_id: null;
    tournament_round: null;
    pre_game_duration: number;
    mvp_account_id: any[];
    coaches: any[];
    level: string;
    timestamp: string;
}
export interface ID {
    low: number;
    high: number;
    unsigned: boolean;
}
export interface HeroDamage {
    pre_reduction: number;
    post_reduction: number;
    damage_type: number;
}
export interface PermanentBuff {
    permanent_buff: number;
    stack_count: number;
    grant_time: number;
}
export interface NotablePlayer {
    heroId: number;
    account_id: number;
    position: number;
    heroName: string;
    name: string;
    image?: string;
    country_code: string;
}
export interface Medals {
    id: string;
    name: string;
    rank_tier: number;
}
export interface DelayedGames {
    _id: string;
    match: {
        server_steam_id: string;
        match_id: string;
        game_mode: number;
        lobby_type: number;
    };
    teams: {
        players: {
            items: number[];
            heroid: number;
            accountid: string;
            team_slot: number;
        }[];
    }[];
}
export interface Cards {
    lifetime_games: number;
    account_id: number;
    leaderboard_rank: number;
    rank_tier: number;
    createdAt: Date;
}
export {};
//# sourceMappingURL=index.d.ts.map