interface Provider {
  // "Dota 2"
  name: string
  // 570 for Dota 2
  appid: number
  // 5.11.2022 it was version 47
  version: number
  // Unix epoch time stamp in seconds of datapoint
  timestamp: number
}

interface MapData {
  // e.g. 'start' (for standard games), 'last_hit_trainer', etc.
  name: string
  // "6845526874";
  matchid: string
  // 34;
  game_time: number
  // -28;
  clock_time: number
  // false;
  daytime: boolean
  // false;
  nightstalker_night: boolean
  // 0;
  radiant_score: number
  // 0;
  dire_score: number
  // "DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD";
  game_state: string
  // false;
  paused: boolean
  // "none";
  win_team: string
  // "";
  customgamename: string
  // 0
  ward_purchase_cooldown: number
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

interface Entity {
  xpos: number
  ypos: number
  image: string
  team: number
  yaw: number
  unitname: string
  visionrange: number
  name?: string
  eventduration?: number
  // parser
  yposP?: string
  // parser
  xposP?: string
  // parser
  teamP?: string
}

type Minimap = Record<string, Entity>

export type Team2PlayerId = `player${0 | 1 | 2 | 3 | 4}`
export type Team3PlayerId = `player${5 | 6 | 7 | 8 | 9}`

type Team2Players<T> = { [K in Team2PlayerId]: T }
type Team3Players<T> = { [K in Team3PlayerId]: T }

interface Player {
  team2?: Team2Players<Player>
  team3?: Team3Players<Player>
  // hero id
  id?: number
  // "76561198352664103",
  steamid: string
  //  "392398375",
  accountid: string
  // "Valhalla",
  name: string
  // "playing",
  activity: string
  // 0,
  kills: number
  //0,
  deaths: number
  // 0,
  assists: number
  // 0,
  last_hits: number
  // 0,
  denies: number
  // 0,
  kill_streak: number
  // 0,
  commands_issued: number
  kill_list: Record<string, number>
  team_name: 'spectator' | 'radiant' | 'dire'
  // 600,
  gold: number
  // 0,
  gold_reliable: number
  //600,
  gold_unreliable: number
  // 0,
  gold_from_hero_kills: number
  // 0,
  gold_from_creep_kills: number
  // 0,
  gold_from_income: number
  // 0,
  gold_from_shared: number
  // 0,
  gpm: number
  // 0
  xpm: number

  // Additional fields in spectating mode
  // 23815;
  net_worth: number
  // 28438;
  hero_damage: number
  // 5924;
  tower_damage: number
  // 8;
  wards_purchased: number
  // 7;
  wards_placed: number
  // 0;
  wards_destroyed: number
  // 8;
  runes_activated: number
  // 2;
  camps_stacked: number
  // 350;
  support_gold_spent: number
  //1720;
  consumable_gold_spent: number
  // 17800;
  item_gold_spent: number
  //1476;
  gold_lost_to_death: number
  //0;
  gold_spent_on_buybacks: number
}

interface Hero {
  team2?: Team2Players<Hero>
  team3?: Team3Players<Hero>
  // -1 if hero not yet set
  id: number
  name?: string
  // -5422,
  xpos?: number
  // -4771,
  ypos?: number
  // 27,
  level?: number
  // 43424,
  xp?: number
  // true,
  alive?: boolean
  // 0,
  respawn_seconds?: number
  // 2655,
  buyback_cost?: number
  // 0,
  buyback_cooldown?: number
  // 2450,
  health?: number
  // 2450,
  max_health?: number
  // 100,
  health_percent?: number
  // 932,
  mana?: number
  // 1107,
  max_mana?: number
  // From 0 to 100, e.g. 84,
  mana_percent?: number
  // false,
  silenced?: boolean
  // false,
  stunned?: boolean
  // false,
  disarmed?: boolean
  // false,
  magicimmune?: boolean
  // false,
  hexed?: boolean
  // false,
  muted?: boolean
  // false,
  break?: boolean
  // false,
  aghanims_scepter?: boolean
  // false,
  aghanims_shard?: boolean
  // false,
  smoked?: boolean
  // false,
  has_debuff?: boolean
  //  true; // Only available as spectator
  selected_unit?: boolean
  // false,
  talent_1?: boolean
  // true,
  talent_2?: boolean
  // true,
  talent_3?: boolean
  // false,
  talent_4?: boolean
  // false,
  talent_5?: boolean
  // true,
  talent_6?: boolean
  // false,
  talent_7?: boolean
  // true
  talent_8?: boolean
}

interface Abilities {
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
  // e.g. "antimage_mana_break" or "seasonal_ti11_balloon"
  name: string
  // e.g. 1,
  level: number
  // e.g. false,
  can_cast: boolean
  // e.g.  false,
  passive: boolean
  // e.g.  true,
  ability_active: boolean
  // e.g. 0
  cooldown: number
  // e.g.  false,
  ultimate: boolean
  // e.g. 0,
  charges: number
  // e.g. 0,
  max_charges: number
  // e.g. 0
  charge_cooldown: number
}

interface Items {
  team2?: Team2Players<Items>
  team3?: Team3Players<Items>

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
interface Item {
  // e.g. item_power_treads or "empty"
  name: string
  // 5,
  purchaser?: number
  // e.g. true,
  can_cast?: boolean
  // e.g. 0,
  cooldown?: number
  // e.g. 1,2,3,4 = 9,8,7,6 seconds for bkb **new 3/12/2023**
  item_level?: number
  // e.g. true for item_paladin_sword
  passive: boolean
  // e.g. 2
  charges?: number
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
  // e.g. 1800
  health: number
  // e.g. 1800
  max_health: number
}
interface Draft {
  // Undefined in player games, but provided in watching replays
  // 2 (radiant) or 3 (dire)
  activeteam: number
  // true,
  pick: boolean
  // e.g. 25,
  activeteam_time_remaining: number
  // e.g.  130,
  radiant_bonus_time: number
  // e.g.  130,
  dire_bonus_time: number
  team2: TeamDraft
  team3: TeamDraft
}
interface TeamDraft {
  // e.g.,  0,
  pick0_id: number
  // e.g.,  '',
  pick0_class: string
  // e.g.,  0,
  pick1_id: number
  // e.g.,  '',
  pick1_class: string
  // e.g.,  0,
  pick2_id: number
  // e.g.,  '',
  pick2_class: string
  // e.g.,  0,
  pick3_id: number
  // e.g.,  '',
  pick3_class: string
  // e.g.,  0,
  pick4_id: number
  // e.g.,  '',
  pick4_class: string
  // e.g.,  69,
  ban0_id: number
  // e.g.,  'doom_bringer',
  ban0_class: string
  // e.g.,  61,
  ban1_id: number
  // e.g.,  'broodmother',
  ban1_class: string
  // e.g.,  0,
  ban2_id: number
  // e.g.,  '',
  ban2_class: string
  // e.g.,  0,
  ban3_id: number
  // e.g.,  '',
  ban3_class: string
  // e.g.,  0,
  ban4_id: number
  // e.g.,  '',
  ban4_class: string
  // e.g.,  0,
  ban5_id: number
  // e.g.,  '',
  ban5_class: string
  // e.g.,  0,
  ban6_id: number
  // e.g.,  ''
  ban6_class: string
}

enum DotaEventTypes {
  RoshanKilled = 'roshan_killed',
  AegisPickedUp = 'aegis_picked_up',
  AegisDenied = 'aegis_denied',
  Tip = 'tip',
  BountyPickup = 'bounty_rune_pickup',
  // spectator only
  CourierKilled = 'courier_killed',
}

interface DotaEvent {
  // 810,
  game_time: number
  event_type: DotaEventTypes

  // Event 'tip'
  // 7,
  sender_player_id: number
  // 3,
  receiver_player_id: number
  // 50
  tip_amount: number

  // Event 'courier_killed'
  // 'dire',
  courier_team: string
  // 1,
  killer_player_id: number
  // 5
  owning_player_id: number

  // Event 'bounty_rune_pickup'
  // 9,
  player_id: number
  // 'dire',
  team: string
  // 45,
  bounty_value: number
  // 225
  team_gold: number

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
  minimap?: Minimap
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
  // it has the same structure as above, and has a value "true"
  added?: Omit<Packet, 'added'>
}

export interface DelayedGames {
  _id: string
  match: {
    server_steam_id: string
    match_id: string
    game_mode: number
    lobby_type: number
  }
  teams: {
    players: {
      items: number[]
      heroid: number
      accountid: string
      team_slot: number
    }[]
    average_mmr?: number
    spectators?: number
  }[]
}
export interface Cards {
  lifetime_games: number
  account_id: number
  leaderboard_rank: number
  rank_tier: number
  createdAt: Date
}
