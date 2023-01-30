import { HeroNames } from './dota/lib/getHero.js'

export interface SocketClient {
  name: string
  steamServerId?: string
  token: string
  stream_online: boolean
  stream_start_date: Date | null
  beta_tester: boolean
  locale: string
  steam32Id: number | null // currently connected steam id
  mmr: number // currently connected mmr
  gsi?: Packet
  Account?: {
    refresh_token: string
    access_token: string
    providerAccountId: string
  } | null
  SteamAccount: {
    mmr: number
    leaderboard_rank: number | null
    name: string | null
    steam32Id: number
  }[]
  settings: {
    key: string
    value: any
  }[]
}
interface Provider {
  name: string // "Dota 2"
  appid: number // 570 for Dota 2
  version: number // 5.11.2022 it was version 47
  timestamp: number // Unix epoch time stamp in seconds of datapoint
}

export interface MapData {
  name: string // e.g. 'start' (for standard games), 'last_hit_trainer', etc.
  matchid: string // "6845526874";
  game_time: number // 34;
  clock_time: number // -28;
  daytime: boolean // false;
  nightstalker_night: boolean // false;
  radiant_score: number // 0;
  dire_score: number // 0;
  game_state: string // "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD";
  paused: boolean // false;
  win_team: string // "none";
  customgamename: string // "";
  ward_purchase_cooldown: number // 0
}

/*
Example player from spec mode
  steamid: '76561198157081101',
  accountid: '196815373',
  name: 'fat',
  activity: 'playing',
  kills: 0,
  deaths: 2,
  assists: 1,
  last_hits: 6,
  denies: 2,
  kill_streak: 0,
  commands_issued: 1319,
  kill_list: {},
  team_name: 'radiant',
  gold: 83,
  gold_reliable: 83,
  gold_unreliable: 0,
  gold_from_hero_kills: 60,
  gold_from_creep_kills: 0,
  gold_from_income: 936,
  gold_from_shared: 60,
  gpm: 138,
  xpm: 170,
  net_worth: 1248,
  hero_damage: 1705,
  tower_damage: 0,
  wards_purchased: 11,
  wards_placed: 6,
  wards_destroyed: 1,
  runes_activated: 0,
  camps_stacked: 0,
  support_gold_spent: 200,
  consumable_gold_spent: 985,
  item_gold_spent: 950,
  gold_lost_to_death: 26,
  gold_spent_on_buybacks: 0
*/
export interface Player {
  team2?: { player0: Player; player1: Player; player2: Player; player3: Player; player4: Player }
  team3?: { player5: Player; player6: Player; player7: Player; player8: Player; player9: Player }
  steamid: string // "76561198352664103",
  accountid: string //  "392398375",
  name: string // "Valhalla",
  activity: string // "playing",
  kills: number // 0,
  deaths: number //0,
  assists: number // 0,
  last_hits: number // 0,
  denies: number // 0,
  kill_streak: number // 0,
  commands_issued: number // 0,
  kill_list: Record<string, number>
  team_name: 'spectator' | 'radiant' | 'dire'
  gold: number // 600,
  gold_reliable: number // 0,
  gold_unreliable: number //600,
  gold_from_hero_kills: number // 0,
  gold_from_creep_kills: number // 0,
  gold_from_income: number // 0,
  gold_from_shared: number // 0,
  gpm: number // 0,
  xpm: number // 0

  // Additional fields in spectating mode
  net_worth: number // 23815;
  hero_damage: number // 28438;
  tower_damage: number // 5924;
  wards_purchased: number // 8;
  wards_placed: number // 7;
  wards_destroyed: number // 0;
  runes_activated: number // 8;
  camps_stacked: number // 2;
  support_gold_spent: number // 350;
  consumable_gold_spent: number //1720;
  item_gold_spent: number // 17800;
  gold_lost_to_death: number //1476;
  gold_spent_on_buybacks: number //0;
}

export interface Hero {
  team2?: { player0: Hero; player1: Hero; player2: Hero; player3: Hero; player4: Hero }
  team3?: { player5: Hero; player6: Hero; player7: Hero; player8: Hero; player9: Hero }
  id: number // -1 if hero not yet set
  name?: HeroNames // e.g. 'npc_dota_hero_antimage' once set
  xpos?: number // -5422,
  ypos?: number // -4771,
  level?: number // 27,
  xp?: number // 43424,
  alive?: boolean // true,
  respawn_seconds?: number // 0,
  buyback_cost?: number // 2655,
  buyback_cooldown?: number // 0,
  health?: number // 2450,
  max_health?: number // 2450,
  health_percent?: number // 100,
  mana?: number // 932,
  max_mana?: number // 1107,
  mana_percent?: number // From 0 to 100, e.g. 84,
  silenced?: boolean // false,
  stunned?: boolean // false,
  disarmed?: boolean // false,
  magicimmune?: boolean // false,
  hexed?: boolean // false,
  muted?: boolean // false,
  break?: boolean // false,
  aghanims_scepter?: boolean // false,
  aghanims_shard?: boolean // false,
  smoked?: boolean // false,
  has_debuff?: boolean // false,
  selected_unit?: boolean //  true; // Only available as spectator
  talent_1?: boolean // false,
  talent_2?: boolean // true,
  talent_3?: boolean // true,
  talent_4?: boolean // false,
  talent_5?: boolean // false,
  talent_6?: boolean // true,
  talent_7?: boolean // false,
  talent_8?: boolean // true
}

export interface Abilities {
  // set once the game starts, i.e. game_state is set to "DOTA_GAMERULES_STATE_PRE_GAME"
  ability0?: Ability
  ability1?: Ability
  ability2?: Ability
  ability3?: Ability
  ability4?: Ability
  ability5?: Ability
  ability6?: Ability
  ability7?: Ability
  ability8?: Ability
  ability9?: Ability
  ability10?: Ability
  ability11?: Ability
  ability12?: Ability
  ability13?: Ability
  ability14?: Ability
  ability15?: Ability
  ability16?: Ability
  ability17?: Ability
  ability18?: Ability
  ability19?: Ability
}
interface Ability {
  name: string // e.g. "antimage_mana_break" or "seasonal_ti11_balloon"
  level: number // e.g. 1,
  can_cast: boolean // e.g. false,
  passive: boolean // e.g.  false,
  ability_active: boolean // e.g.  true,
  cooldown: number // e.g. 0
  ultimate: boolean // e.g.  false,
  charges: number // e.g. 0,
  max_charges: number // e.g. 0,
  charge_cooldown: number // e.g. 0
}

export interface Items {
  // set once the game starts, i.e. game_state is set to "DOTA_GAMERULES_STATE_PRE_GAME"
  slot0?: Item
  slot1?: Item
  slot2?: Item
  slot3?: Item
  slot4?: Item
  slot5?: Item
  slot6?: Item
  slot7?: Item
  slot8?: Item
  stash0?: Item
  stash1?: Item
  stash2?: Item
  stash3?: Item
  stash4?: Item
  stash5?: Item
  teleport0?: Item
  neutral0?: Item
}
export interface Item {
  name: string // e.g. item_power_treads or "empty"
  purchaser?: number // 5,
  can_cast?: boolean // e.g. true,
  cooldown?: number // e.g. 0,
  passive: boolean // e.g. true for item_paladin_sword
  charges?: number // e.g. 2
}
interface Buildings {
  dota_badguys_tower1_top: Building
  dota_badguys_tower2_top: Building
  dota_badguys_tower3_top: Building
  dota_badguys_tower1_mid: Building
  dota_badguys_tower2_mid: Building
  dota_badguys_tower3_mid: Building
  dota_badguys_tower1_bot: Building
  dota_badguys_tower2_bot: Building
  dota_badguys_tower3_bot: Building
  dota_badguys_tower4_top: Building
  dota_badguys_tower4_bot: Building
  bad_rax_melee_top: Building
  bad_rax_range_top: Building
  bad_rax_melee_mid: Building
  bad_rax_range_mid: Building
  bad_rax_melee_bot: Building
  bad_rax_range_bot: Building
  dota_badguys_fort: Building
}
interface Building {
  health: number // e.g. 1800
  max_health: number // e.g. 1800
}
interface Draft {
  // Undefined in player games, but provided in watching replays
  activeteam: number // 2 (radiant) or 3 (dire)
  pick: boolean // true,
  activeteam_time_remaining: number // e.g. 25,
  radiant_bonus_time: number // e.g.  130,
  dire_bonus_time: number // e.g.  130,
  team2: TeamDraft
  team3: TeamDraft
}
interface TeamDraft {
  pick0_id: number // e.g.,  0,
  pick0_class: string // e.g.,  '',
  pick1_id: number // e.g.,  0,
  pick1_class: string // e.g.,  '',
  pick2_id: number // e.g.,  0,
  pick2_class: string // e.g.,  '',
  pick3_id: number // e.g.,  0,
  pick3_class: string // e.g.,  '',
  pick4_id: number // e.g.,  0,
  pick4_class: string // e.g.,  '',
  ban0_id: number // e.g.,  69,
  ban0_class: string // e.g.,  'doom_bringer',
  ban1_id: number // e.g.,  61,
  ban1_class: string // e.g.,  'broodmother',
  ban2_id: number // e.g.,  0,
  ban2_class: string // e.g.,  '',
  ban3_id: number // e.g.,  0,
  ban3_class: string // e.g.,  '',
  ban4_id: number // e.g.,  0,
  ban4_class: string // e.g.,  '',
  ban5_id: number // e.g.,  0,
  ban5_class: string // e.g.,  '',
  ban6_id: number // e.g.,  0,
  ban6_class: string // e.g.,  ''
}

export enum DotaEventTypes {
  RoshanKilled = 'roshan_killed',
  AegisPickedUp = 'aegis_picked_up',
  AegisDenied = 'aegis_denied',
  Tip = 'tip',
  BountyPickup = 'bounty_rune_pickup',
  CourierKilled = 'courier_killed',
}

export interface DotaEvent {
  game_time: number // 810,
  event_type: DotaEventTypes

  // Event 'tip'
  sender_player_id: number // 7,
  receiver_player_id: number // 3,
  tip_amount: number // 50

  // Event 'courier_killed'
  courier_team: string // 'dire',
  killer_player_id: number // 1,
  owning_player_id: number // 5

  // Event 'bounty_rune_pickup'
  player_id: number // 9,
  team: string // 'dire',
  bounty_value: number // 45,
  team_gold: number // 225

  // Event 'roshan_killed'
  killed_by_team: 'dire'
  //killer_player_id: 7;

  // Event 'aegis_picked_up'
  //player_id: 7;
  snatched: false

  // Event 'aegis_denied'
  //player_id: 7;
}
/**
 *
 * Dump elements that are not matching data structure....
 *
 */

export interface Packet {
  provider: Provider
  map?: MapData
  player?: Player
  hero?: Hero
  abilities?: Abilities
  items?: Items
  buildings?: {
    // only providing information for own towers in a game, of for all towers if a spectator
    radiant?: Buildings
    dire?: Buildings
  }
  draft?: Draft
  events?: DotaEvent[]
  previously?: Omit<Packet, 'previously'> & { map: MapData | boolean }
  added?: Omit<Packet, 'added'> // it has the same structure as above, and has a value "true"
}

export interface GCMatchData {
  result: number
  match?: Match
  vote: number
}

export interface Match {
  duration: number
  starttime: number
  players: Player[]
  match_id: ID
  tower_status: number[]
  barracks_status: number[]
  cluster: number
  first_blood_time: number
  replay_salt: number
  server_ip: null
  server_port: null
  lobby_type: number
  human_players: number
  average_skill: null
  game_balance: null
  radiant_team_id: null
  dire_team_id: null
  leagueid: number
  radiant_team_name: null
  dire_team_name: null
  radiant_team_logo: null
  dire_team_logo: null
  radiant_team_logo_url: null
  dire_team_logo_url: null
  radiant_team_complete: null
  dire_team_complete: null
  positive_votes: number
  negative_votes: number
  game_mode: number
  picks_bans: any[]
  match_seq_num: null
  replay_state: number
  radiant_guild_id: null
  dire_guild_id: null
  radiant_team_tag: null
  dire_team_tag: null
  series_id: number
  series_type: number
  broadcaster_channels: any[]
  engine: number
  custom_game_data: null
  match_flags: number
  private_metadata_key: null
  radiant_team_score: number
  dire_team_score: number
  match_outcome: number
  tournament_id: null
  tournament_round: null
  pre_game_duration: number
  mvp_account_id: any[]
  coaches: any[]
  level: string
  timestamp: string
}

export interface ID {
  low: number
  high: number
  unsigned: boolean
}

export interface HeroDamage {
  pre_reduction: number
  post_reduction: number
  damage_type: number
}

export interface PermanentBuff {
  permanent_buff: number
  stack_count: number
  grant_time: number
}
