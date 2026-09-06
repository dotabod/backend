import type { Database } from '@dotabod/shared-utils'

import type { HeroNames } from './dota/lib/get-hero'

export interface SocketClient {
  name: string
  token: string
  stream_online: boolean
  stream_start_date: Date | null
  beta_tester: boolean
  locale: string
  multiAccount?: number
  // currently connected steam id
  steam32Id: number | null
  // currently connected mmr
  mmr: number
  gsi?: Packet
  gsiUpdatedAt?: number
  pendingGsi?: Packet
  pendingGsiUpdatedAt?: number
  Account: {
    requires_refresh: boolean
    refresh_token: string
    access_token: string
    expires_at: number | null
    scope: string | null
    obtainment_timestamp: Date | null
    expires_in: number | null
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
    value: unknown
  }[]
  subscription?: {
    id: string
    tier: Database['public']['Tables']['subscriptions']['Row']['tier']
    status: Database['public']['Tables']['subscriptions']['Row']['status']
    isGift: Database['public']['Tables']['subscriptions']['Row']['isGift']
  }
}
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

export interface MapData {
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

export interface Entity {
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

export interface Player {
  team2?: { player0: Player; player1: Player; player2: Player; player3: Player; player4: Player }
  team3?: { player5: Player; player6: Player; player7: Player; player8: Player; player9: Player }
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
  // authoritative side — use this, NOT slot, for team
  team_name: 'spectator' | 'radiant' | 'dire'
  // Lobby slot. Verified live: does NOT follow "0-4 radiant / 5-9 dire" — e.g. slot 9 can be radiant.
  // Don't derive team or hero color from player_slot; it's reshuffled (esp. high-immortal / ranked roles).
  player_slot: number
  // position WITHIN the team, 0-4 (both teams use 0-4) — NOT a team indicator
  team_slot: number
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

export interface Hero {
  team2?: { player0: Hero; player1: Hero; player2: Hero; player3: Hero; player4: Hero }
  team3?: { player5: Hero; player6: Hero; player7: Hero; player8: Hero; player9: Hero }
  // -1 if hero not yet set
  id: number
  // e.g. 'npc_dota_hero_antimage' once set
  name?: HeroNames
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
  // true,
  talent_8?: boolean
  // 6 - total amount of attribute points they put in stats
  attributes_level?: number
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
export interface Ability {
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

export interface Items {
  team2?: { player0: Items; player1: Items; player2: Items; player3: Items; player4: Items }
  team3?: { player5: Items; player6: Items; player7: Items; player8: Items; player9: Items }

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
  item_charges?: number
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

export interface ChatEventData {
  type: ChatMessageType
  value: number
  playerid1: number
  playerid2: number
  playerid3?: number
  playerid4?: number
  playerid5?: number
  playerid6?: number
  value2?: number
  value3?: number
  time: number
}

export enum ChatMessageType {
  ChatMessageAbandonRankedBeforeFirstBloodParty = 'CHAT_MESSAGE_ABANDON_RANKED_BEFORE_FIRST_BLOOD_PARTY',
  ChatMessageAbilityDraftRandomed = 'CHAT_MESSAGE_ABILITY_DRAFT_RANDOMED',
  ChatMessageAbilityDraftStart = 'CHAT_MESSAGE_ABILITY_DRAFT_START',
  ChatMessageAlchemistGrantedScepter = 'CHAT_MESSAGE_ALCHEMIST_GRANTED_SCEPTER',
  ChatMessageBannerPlanted = 'CHAT_MESSAGE_BANNER_PLANTED',
  ChatMessageBarracksKill = 'CHAT_MESSAGE_BARRACKS_KILL',
  ChatMessageBuyback = 'CHAT_MESSAGE_BUYBACK',
  ChatMessageCanQuitWithoutAbandon = 'CHAT_MESSAGE_CAN_QUIT_WITHOUT_ABANDON',
  ChatMessageCantPauseTooEarly = 'CHAT_MESSAGE_CANT_PAUSE_TOO_EARLY',
  ChatMessageCantpauseyet = 'CHAT_MESSAGE_CANTPAUSEYET',
  ChatMessageCantUnpauseTeam = 'CHAT_MESSAGE_CANTUNPAUSETEAM',
  ChatMessageCantUseActionItem = 'CHAT_MESSAGE_CANT_USE_ACTION_ITEM',
  ChatMessageCourierLost = 'CHAT_MESSAGE_COURIER_LOST',
  ChatMessageCourierRespawned = 'CHAT_MESSAGE_COURIER_RESPAWNED',
  ChatMessageDisconnect = 'CHAT_MESSAGE_DISCONNECT',
  ChatMessageDisconnectTimeRemaining = 'CHAT_MESSAGE_DISCONNECT_TIME_REMAINING',
  ChatMessageDisconnectTimeRemainingPlural = 'CHAT_MESSAGE_DISCONNECT_TIME_REMAINING_PLURAL',
  ChatMessageDisconnectWaitForReconnect = 'CHAT_MESSAGE_DISCONNECT_WAIT_FOR_RECONNECT',
  ChatMessageEffigyKill = 'CHAT_MESSAGE_EFFIGY_KILL',
  ChatMessageFirstblood = 'CHAT_MESSAGE_FIRSTBLOOD',
  ChatMessageGlyphUsed = 'CHAT_MESSAGE_GLYPH_USED',
  ChatMessageHeroBanned = 'CHAT_MESSAGE_HERO_BANNED',
  ChatMessageHeroChoiceInvalid = 'CHAT_MESSAGE_HERO_CHOICE_INVALID',
  ChatMessageHeroDeny = 'CHAT_MESSAGE_HERO_DENY',
  ChatMessageHeroKill = 'CHAT_MESSAGE_HERO_KILL',
  ChatMessageInformational = 'CHAT_MESSAGE_INFORMATIONAL',
  ChatMessageInthebag = 'CHAT_MESSAGE_INTHEBAG',
  ChatMessageItemPurchase = 'CHAT_MESSAGE_ITEM_PURCHASE',
  ChatMessageLowPriorityCompletedExplanation = 'CHAT_MESSAGE_LOW_PRIORITY_COMPLETED_EXPLANATION',
  ChatMessageMinibossKill = 'CHAT_MESSAGE_MINIBOSS_KILL',
  ChatMessageNewPlayerReminder = 'CHAT_MESSAGE_NEW_PLAYER_REMINDER',
  ChatMessageNoBattlePoints = 'CHAT_MESSAGE_NO_BATTLE_POINTS',
  ChatMessageNopausesleft = 'CHAT_MESSAGE_NOPAUSESLEFT',
  ChatMessageObserverWardKilled = 'CHAT_MESSAGE_OBSERVER_WARD_KILLED',
  ChatMessagePauseCountdown = 'CHAT_MESSAGE_PAUSE_COUNTDOWN',
  ChatMessagePaused = 'CHAT_MESSAGE_PAUSED',
  ChatMessagePlayerAbandoned = 'CHAT_MESSAGE_PLAYER_ABANDONED',
  ChatMessagePlayerAbandonedAfk = 'CHAT_MESSAGE_PLAYER_ABANDONED_AFK',
  ChatMessagePlayerAbandonedDisconnectedTooLong = 'CHAT_MESSAGE_PLAYER_ABANDONED_DISCONNECTED_TOO_LONG',
  ChatMessagePlayerInGameBanText = 'CHAT_MESSAGE_PLAYER_IN_GAME_BAN_TEXT',
  ChatMessagePlayerLeft = 'CHAT_MESSAGE_PLAYER_LEFT',
  ChatMessagePrivateCoachConnected = 'CHAT_MESSAGE_PRIVATE_COACH_CONNECTED',
  ChatMessageRandom = 'CHAT_MESSAGE_RANDOM',
  ChatMessageRankWager = 'CHAT_MESSAGE_RANK_WAGER',
  ChatMessageReconnect = 'CHAT_MESSAGE_RECONNECT',
  ChatMessageReportReminder = 'CHAT_MESSAGE_REPORT_REMINDER',
  ChatMessageRoshanRoar = 'CHAT_MESSAGE_ROSHAN_ROAR',
  ChatMessageRuneBottle = 'CHAT_MESSAGE_RUNE_BOTTLE',
  ChatMessageRuneDeny = 'CHAT_MESSAGE_RUNE_DENY',
  ChatMessageSafeToLeave = 'CHAT_MESSAGE_SAFE_TO_LEAVE',
  ChatMessageScanUsed = 'CHAT_MESSAGE_SCAN_USED',
  ChatMessageSentryWardKilled = 'CHAT_MESSAGE_SENTRY_WARD_KILLED',
  ChatMessageSmokeActivated = 'CHAT_MESSAGE_SMOKE_ACTIVATED',
  ChatMessageSpectatorsWatchingThisGame = 'CHAT_MESSAGE_SPECTATORS_WATCHING_THIS_GAME',
  ChatMessageStreakKill = 'CHAT_MESSAGE_STREAK_KILL',
  ChatMessageSuperCreeps = 'CHAT_MESSAGE_SUPER_CREEPS',
  ChatMessageTowerDeny = 'CHAT_MESSAGE_TOWER_DENY',
  ChatMessageTowerKill = 'CHAT_MESSAGE_TOWER_KILL',
  ChatMessageUnpauseCountdown = 'CHAT_MESSAGE_UNPAUSE_COUNTDOWN',
  ChatMessageUnpaused = 'CHAT_MESSAGE_UNPAUSED',
  ChatMessageVictoryPredictionStreak = 'CHAT_MESSAGE_VICTORY_PREDICTION_STREAK',
  ChatMessageVoiceTextBanned = 'CHAT_MESSAGE_VOICE_TEXT_BANNED',
  ChatMessageWillNotBeScored = 'CHAT_MESSAGE_WILL_NOT_BE_SCORED',
  ChatMessageWillNotBeScoredRanked = 'CHAT_MESSAGE_WILL_NOT_BE_SCORED_RANKED',
  ChatMessageYoupaused = 'CHAT_MESSAGE_YOUPAUSED',
}

export enum DotaEventTypes {
  RoshanKilled = 'roshan_killed',
  AegisPickedUp = 'aegis_picked_up',
  AegisDenied = 'aegis_denied',
  Tip = 'tip',
  BountyPickup = 'bounty_rune_pickup',
  // spectator only
  CourierKilled = 'courier_killed',

  ChatMessage = 'chat_message',
  GenericEvent = 'generic_event',
}

export const validEventTypes = new Set(Object.values(DotaEventTypes))

// Raw GSI `events[]` entry. Dota emits any event type carrying only the fields
// for THAT type, so everything except game_time/event_type is optional here —
// don't assume a field exists off a raw DotaEvent. Handlers, which know their
// event_type, should type their payload as the precise *Event interfaces below
// (they get only the fields that event actually sends, verified live).
export interface DotaEvent {
  game_time: number
  event_type: DotaEventTypes
  // chat_message
  // 11/12, ally vs all chat
  channel_type?: number
  message?: string
  // generic_event
  // JSON string parsed as ChatEventData
  data?: string
  // tip
  sender_player_id?: number
  receiver_player_id?: number
  tip_amount?: number
  // courier_killed (spectator only)
  courier_team?: string
  owning_player_id?: number
  // bounty_rune_pickup
  player_id?: number
  team?: 'radiant' | 'dire'
  bounty_value?: number
  team_gold?: number
  // roshan_killed (NOTE: carries killer_player_id, NOT player_id)
  killed_by_team?: 'radiant' | 'dire'
  killer_player_id?: number
  // aegis_picked_up
  snatched?: boolean
}

interface BaseDotaEvent {
  game_time: number
}
export interface AegisPickedUpEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.AegisPickedUp
  player_id: number
  snatched: boolean
}
// NOT verified against live capture (0 aegis_denied seen in sampling) — assumed to
// mirror aegis_picked_up; the handler only reads player_id + game_time regardless.
export interface AegisDeniedEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.AegisDenied
  player_id: number
}
export interface RoshanKilledEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.RoshanKilled
  killed_by_team: 'radiant' | 'dire'
  killer_player_id: number
}
export interface TipEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.Tip
  sender_player_id: number
  receiver_player_id: number
  tip_amount: number
}
export interface BountyRunePickupEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.BountyPickup
  player_id: number
  team: 'radiant' | 'dire'
  bounty_value: number
  team_gold: number
}
export interface ChatMessageEvent extends BaseDotaEvent {
  event_type: DotaEventTypes.ChatMessage
  player_id: number
  channel_type: number
  message: string
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
  // Cosmetic items equipped on the played hero, keyed wearable0/wearable1/…
  // (value = item definition index). Styles arrive as style0/style1/… in the
  // same object. Only present in player (own-hero) mode.
  wearables?: Record<string, number>
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

export interface NotablePlayer {
  heroId: number
  account_id: number
  position: number
  heroName: string
  name: string
  image?: string
  country_code: string
}

export interface Medals {
  id: string
  name: string
  rank_tier: number
}

export interface DelayedGames {
  average_mmr?: number
  spectators?: number
  match: {
    server_steam_id: string
    match_id: string
    game_mode: number
    lobby_type: number
  }
  players: {
    accountid: string
    heroid: number
    player_name?: string
  }[]
  teams: {
    players: {
      accountid: number
      playerid: number
      name: string
      team: number
      heroid: number
      level: number
      kill_count: number
      death_count: number
      assists_count: number
      denies_count: number
      lh_count: number
      gold: number
      x: number
      y: number
      net_worth: number
      abilities: number[]
      items: number[]
      team_slot: number
    }[]
  }[]
}
export interface Cards {
  lifetime_games: number
  account_id: number
  leaderboard_rank: number
  rank_tier: number
  createdAt: Date
}

export type Players = {
  heroid: number | undefined
  accountid: number
  // usually null when the player has not picked a hero yet
  playerid: number | null
  rank?: number
  player_name?: string
  selected?: boolean
}[]

// Set when only a draft clip has been processed for a match: player names are
// known but hero detection is still pending ('waiting') or didn't succeed ('failed').
export type HeroesStatus = 'waiting' | 'failed'

export type BlockType =
  | 'spectator'
  | 'empty'
  | 'picks'
  | 'arcade'
  | 'playing'
  | 'strategy'
  | 'strategy-2'
  | 'draft'
  | null

interface MatchPlayer {
  account_id: number
  hero_id: number
  kills: number
  deaths: number
  assists: number
  items: number[]
  player_slot: number
  pro_name: string
  level: number
  team_number: DotaGcTeam
}

export enum EMatchOutcome {
  k_EMatchOutcome_RadVictory = 2,
  k_EMatchOutcome_DireVictory = 3,
}

interface MatchMinimal {
  match_id: {
    low: number
    high: number
    unsigned: boolean
  }
  start_time: number
  duration: number
  game_mode: number
  // 2 = Radiant Victory, 3 = Dire Victory

  match_outcome: EMatchOutcome
  players: MatchPlayer[]
  tourney: unknown
  radiant_score: number
  dire_score: number
  lobby_type: number
}

export interface MatchMinimalDetailsResponse {
  matches: MatchMinimal[]
  last_match: unknown
}

export interface MatchClosingDetailsResponse {
  matches: {
    dire_score: number
    match_id: MatchMinimal['match_id']
    players: Pick<
      MatchPlayer,
      'account_id' | 'assists' | 'deaths' | 'hero_id' | 'kills' | 'player_slot' | 'team_number'
    >[]
    radiant_score: number
  }[]
}

export enum DotaGcTeam {
  DOTA_GC_TEAM_GOOD_GUYS = 0,
  DOTA_GC_TEAM_BAD_GUYS = 1,
}
