import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CMsgPendingEventAward, DOTAGameMode, dotaGcTeam, EEvent, ELeaguePhase, ELeagueRegion, EMatchOutcome } from "./dota_shared_enums";
export declare enum ESpecialPingValue {
    k_ESpecialPingValue_NoData = 16382,
    k_ESpecialPingValue_Failed = 16383
}
export declare function eSpecialPingValueFromJSON(object: any): ESpecialPingValue;
export declare function eSpecialPingValueToJSON(object: ESpecialPingValue): string;
export declare enum EDOTAGCSessionNeed {
    k_EDOTAGCSessionNeed_Unknown = 0,
    k_EDOTAGCSessionNeed_UserNoSessionNeeded = 100,
    k_EDOTAGCSessionNeed_UserInOnlineGame = 101,
    k_EDOTAGCSessionNeed_UserInLocalGame = 102,
    k_EDOTAGCSessionNeed_UserInUIWasConnected = 103,
    k_EDOTAGCSessionNeed_UserInUINeverConnected = 104,
    k_EDOTAGCSessionNeed_UserTutorials = 105,
    k_EDOTAGCSessionNeed_UserInUIWasConnectedIdle = 106,
    k_EDOTAGCSessionNeed_UserInUINeverConnectedIdle = 107,
    k_EDOTAGCSessionNeed_GameServerOnline = 200,
    k_EDOTAGCSessionNeed_GameServerLocal = 201,
    k_EDOTAGCSessionNeed_GameServerIdle = 202,
    k_EDOTAGCSessionNeed_GameServerRelay = 203,
    k_EDOTAGCSessionNeed_GameServerLocalUpload = 204
}
export declare function eDOTAGCSessionNeedFromJSON(object: any): EDOTAGCSessionNeed;
export declare function eDOTAGCSessionNeedToJSON(object: EDOTAGCSessionNeed): string;
export declare enum EDOTAMatchPlayerTimeCustomStat {
    k_EDOTA_MatchPlayerTimeCustomStat_HPRegenUnderT1Towers = 1,
    k_EDOTA_MatchPlayerTimeCustomStat_MagicDamageReducedWithNewFormula_Absolute = 2,
    k_EDOTA_MatchPlayerTimeCustomStat_MagicDamageReducedWithNewFormula_PercentOfTotalHP = 3
}
export declare function eDOTAMatchPlayerTimeCustomStatFromJSON(object: any): EDOTAMatchPlayerTimeCustomStat;
export declare function eDOTAMatchPlayerTimeCustomStatToJSON(object: EDOTAMatchPlayerTimeCustomStat): string;
export declare enum DOTATournamentEvents {
    TE_FIRST_BLOOD = 0,
    TE_GAME_END = 1,
    TE_MULTI_KILL = 2,
    TE_HERO_DENY = 3,
    TE_AEGIS_DENY = 4,
    TE_AEGIS_STOLEN = 5,
    TE_GODLIKE = 6,
    TE_COURIER_KILL = 7,
    TE_ECHOSLAM = 8,
    TE_RAPIER = 9,
    TE_EARLY_ROSHAN = 10,
    TE_BLACK_HOLE = 11
}
export declare function dOTATournamentEventsFromJSON(object: any): DOTATournamentEvents;
export declare function dOTATournamentEventsToJSON(object: DOTATournamentEvents): string;
export declare enum EBroadcastTimelineEvent {
    EBroadcastTimelineEvent_MatchStarted = 1,
    EBroadcastTimelineEvent_GameStateChanged = 2,
    EBroadcastTimelineEvent_TowerDeath = 3,
    EBroadcastTimelineEvent_BarracksDeath = 4,
    EBroadcastTimelineEvent_AncientDeath = 5,
    EBroadcastTimelineEvent_RoshanDeath = 6,
    EBroadcastTimelineEvent_HeroDeath = 7,
    EBroadcastTimelineEvent_TeamFight = 8,
    EBroadcastTimelineEvent_FirstBlood = 9
}
export declare function eBroadcastTimelineEventFromJSON(object: any): EBroadcastTimelineEvent;
export declare function eBroadcastTimelineEventToJSON(object: EBroadcastTimelineEvent): string;
export declare enum ECustomGameWhitelistState {
    CUSTOM_GAME_WHITELIST_STATE_UNKNOWN = 0,
    CUSTOM_GAME_WHITELIST_STATE_APPROVED = 1,
    CUSTOM_GAME_WHITELIST_STATE_REJECTED = 2
}
export declare function eCustomGameWhitelistStateFromJSON(object: any): ECustomGameWhitelistState;
export declare function eCustomGameWhitelistStateToJSON(object: ECustomGameWhitelistState): string;
export declare enum EDOTATriviaQuestionCategory {
    k_EDOTATriviaQuestionCategory_AbilityIcon = 0,
    k_EDOTATriviaQuestionCategory_AbilityCooldown = 1,
    k_EDOTATriviaQuestionCategory_HeroAttributes = 2,
    k_EDOTATriviaQuestionCategory_HeroMovementSpeed = 3,
    k_EDOTATriviaQuestionCategory_TalentTree = 4,
    k_EDOTATriviaQuestionCategory_HeroStats = 5,
    k_EDOTATriviaQuestionCategory_ItemPrice = 6,
    k_EDOTATriviaQuestionCategory_AbilitySound = 7,
    k_EDOTATriviaQuestionCategory_InvokerSpells = 8,
    k_EDOTATriviaQuestionCategory_AbilityManaCost = 9,
    k_EDOTATriviaQuestionCategory_HeroAttackSound = 10,
    k_EDOTATriviaQuestionCategory_AbilityName = 11,
    k_EDOTATriviaQuestionCategory_ItemComponents = 12,
    k_EDOTATriviaQuestionCategory_ItemLore = 13,
    k_EDOTATriviaQuestionCategory_ItemPassives = 14,
    k_EDOTATriviaQuestionCategory_STATIC_QUESTIONS_END = 15,
    k_EDOTATriviaQuestionCategory_DYNAMIC_QUESTIONS_START = 99,
    k_EDOTATriviaQuestionCategory_Dynamic_ItemBuild = 100
}
export declare function eDOTATriviaQuestionCategoryFromJSON(object: any): EDOTATriviaQuestionCategory;
export declare function eDOTATriviaQuestionCategoryToJSON(object: EDOTATriviaQuestionCategory): string;
export declare enum EOverwatchConviction {
    k_EOverwatchConviction_None = 0,
    k_EOverwatchConviction_NotGuilty = 1,
    k_EOverwatchConviction_GuiltUnclear = 2,
    k_EOverwatchConviction_Guilty = 3
}
export declare function eOverwatchConvictionFromJSON(object: any): EOverwatchConviction;
export declare function eOverwatchConvictionToJSON(object: EOverwatchConviction): string;
export declare enum EHeroRelicRarity {
    HERO_RELIC_RARITY_INVALID = -1,
    HERO_RELIC_RARITY_COMMON = 0,
    HERO_RELIC_RARITY_RARE = 1
}
export declare function eHeroRelicRarityFromJSON(object: any): EHeroRelicRarity;
export declare function eHeroRelicRarityToJSON(object: EHeroRelicRarity): string;
export declare enum EStickerbookAuditAction {
    STICKERBOOK_AUDIT_CREATE_PAGE = 0,
    STICKERBOOK_AUDIT_DELETE_PAGE = 1,
    STICKERBOOK_AUDIT_STICK_STICKERS = 2,
    STICKERBOOK_AUDIT_REPLACE_STICKERS = 3,
    STICKERBOOK_AUDIT_HERO_STICKER = 4
}
export declare function eStickerbookAuditActionFromJSON(object: any): EStickerbookAuditAction;
export declare function eStickerbookAuditActionToJSON(object: EStickerbookAuditAction): string;
export declare enum EStickerbookPageType {
    STICKER_PAGE_GENERIC = 0,
    STICKER_PAGE_TEAM = 1,
    STICKER_PAGE_TALENT = 2
}
export declare function eStickerbookPageTypeFromJSON(object: any): EStickerbookPageType;
export declare function eStickerbookPageTypeToJSON(object: EStickerbookPageType): string;
export declare enum ENewBloomGiftingResponse {
    kENewBloomGifting_Success = 0,
    kENewBloomGifting_UnknownFailure = 1,
    kENewBloomGifting_MalformedRequest = 2,
    kENewBloomGifting_FeatureDisabled = 3,
    kENewBloomGifting_ItemNotFound = 4,
    kENewBloomGifting_PlayerNotAllowedToGiveGifts = 5,
    kENewBloomGifting_TargetNotAllowedToReceiveGifts = 6,
    kENewBloomGifting_ServerNotAuthorized = 100,
    kENewBloomGifting_PlayerNotInLobby = 101,
    kENewBloomGifting_TargetNotInLobby = 102,
    kENewBloomGifting_LobbyNotEligible = 103,
    kENewBloomGifting_TargetNotFriend = 200,
    kENewBloomGifting_TargetFriendDurationTooShort = 201
}
export declare function eNewBloomGiftingResponseFromJSON(object: any): ENewBloomGiftingResponse;
export declare function eNewBloomGiftingResponseToJSON(object: ENewBloomGiftingResponse): string;
export interface CSODOTAGameAccountClient {
    accountId: number;
    wins: number;
    losses: number;
    xp: number;
    level: number;
    initialSkill: number;
    leaverCount: number;
    secondaryLeaverCount: number;
    lowPriorityUntilDate: number;
    preventTextChatUntilDate: number;
    preventVoiceUntilDate: number;
    preventPublicTextChatUntilDate: number;
    preventNewPlayerChatUntilDate: number;
    lastAbandonedGameDate: number;
    lastSecondaryAbandonedGameDate: number;
    leaverPenaltyCount: number;
    completedGameStreak: number;
    accountDisabledUntilDate: number;
    accountDisabledCount: number;
    matchDisabledUntilDate: number;
    matchDisabledCount: number;
    shutdownlawterminatetimestamp: number;
    lowPriorityGamesRemaining: number;
    recruitmentLevel: number;
    hasNewNotifications: boolean;
    isLeagueAdmin: boolean;
    casualGamesPlayed: number;
    soloCompetitiveGamesPlayed: number;
    partyCompetitiveGamesPlayed: number;
    casual1v1GamesPlayed: number;
    currAllHeroChallengeId: number;
    playTimePoints: number;
    accountFlags: number;
    playTimeLevel: number;
    playerBehaviorSeqNumLastReport: number;
    playerBehaviorScoreLastReport: number;
    playerBehaviorReportOldData: boolean;
    tourneySkillLevel: number;
    tourneyRecentParticipationDate: number;
    anchoredPhoneNumberId: string;
    rankedMatchmakingBanUntilDate: number;
    recentGameTime1: number;
    recentGameTime2: number;
    recentGameTime3: number;
    favoriteTeamPacked: string;
    recentReportTime: number;
    customGameDisabledUntilDate: number;
    recentWinTime1: number;
    recentWinTime2: number;
    recentWinTime3: number;
    coachRating: number;
    queuePoints: number;
    roleHandicaps: CSODOTAGameAccountClient_RoleHandicap[];
    eventModeRecentTime: number;
    mmrRecalibrationTime: number;
    bannedHeroIds: number[];
}
export interface CSODOTAGameAccountClient_RoleHandicap {
    role: number;
    handicap: number;
}
export interface CSODOTAGameAccountPlus {
    accountId: number;
    originalStartDate: number;
    plusFlags: number;
    plusStatus: number;
    prepaidTimeStart: number;
    prepaidTimeBalance: number;
    nextPaymentDate: number;
    steamAgreementId: string;
}
export interface CSODOTAChatWheel {
    messageId: number;
}
export interface CMsgLobbyFeaturedGamemodeProgress {
    accounts: CMsgLobbyFeaturedGamemodeProgress_AccountProgress[];
}
export interface CMsgLobbyFeaturedGamemodeProgress_AccountProgress {
    accountId: number;
    currentValue: number;
    maxValue: number;
}
export interface CMsgBattleCupVictory {
    accountId: number;
    winDate: number;
    validUntil: number;
    skillLevel: number;
    tournamentId: number;
    divisionId: number;
    teamId: number;
    streak: number;
    trophyId: number;
}
export interface CMsgLobbyBattleCupVictoryList {
    winners: CMsgBattleCupVictory[];
}
export interface CMsgDOTABroadcastNotification {
    message: string;
}
export interface CProtoItemHeroStatue {
    heroId: number;
    statusEffectIndex: number;
    sequenceName: string;
    cycle: number;
    wearable: number[];
    inscription: string;
    style: number[];
    tournamentDrop: boolean;
}
export interface CMatchPlayerAbilityUpgrade {
    ability: number;
    time: number;
}
export interface CMatchPlayerTimedCustomStat {
    stat: EDOTAMatchPlayerTimeCustomStat;
    value: number;
}
export interface CMatchPlayerTimedStats {
    time: number;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    xp: number;
    lastHits: number;
    denies: number;
    bountyRuneGold: number;
    rangeCreepUpgradeGold: number;
    observerWardsDewarded: number;
    reliableGoldEarned: number;
    goldLossPrevented: number;
    heroKillGold: number;
    creepKillGold: number;
    buildingGold: number;
    otherGold: number;
    comebackGold: number;
    experimentalGold: number;
    experimental2Gold: number;
    creepDenyGold: number;
    tpScrollsPurchased1: number;
    tpScrollsPurchased2: number;
    tpScrollsPurchased3: number;
    tpScrollsPurchased4: number;
    tpScrollsPurchased5: number;
    neutralGold: number;
    courierGold: number;
    roshanGold: number;
    incomeGold: number;
    itemValue: number;
    supportGoldSpent: number;
    campsStacked: number;
    wardsPlaced: number;
    tripleKills: number;
    rampages: number;
    customStats: CMatchPlayerTimedCustomStat[];
}
export interface CMatchTeamTimedStats {
    time: number;
    enemyTowersKilled: number;
    enemyBarracksKilled: number;
    enemyTowersStatus: number;
    enemyBarracksStatus: number;
}
export interface CMatchAdditionalUnitInventory {
    unitName: string;
    items: number[];
}
export interface CMatchPlayerPermanentBuff {
    permanentBuff: number;
    stackCount: number;
    grantTime: number;
}
export interface CMatchHeroSelectEvent {
    isPick: boolean;
    team: number;
    heroId: number;
}
export interface CMatchClip {
    matchId: string;
    playerAccountId: number;
    gameTimeSeconds: number;
    durationSeconds: number;
    playerId: number;
    heroId: number;
    abilityId: number;
    cameraMode: number;
    comment: string;
}
export interface CPartySearchClientParty {
    partyId: string;
    beaconType: number;
    partyMembers: number[];
}
export interface CMsgDOTAHasItemQuery {
    accountId: number;
    itemId: string;
}
export interface CMsgDOTAHasItemResponse {
    hasItem: boolean;
}
export interface CMsgGCGetPlayerCardItemInfo {
    accountId: number;
    playerCardItemIds: string[];
    allForEvent: number;
}
export interface CMsgGCGetPlayerCardItemInfoResponse {
    playerCardInfos: CMsgGCGetPlayerCardItemInfoResponse_PlayerCardInfo[];
}
export interface CMsgGCGetPlayerCardItemInfoResponse_PlayerCardInfo {
    playerCardItemId: string;
    accountId: number;
    packedBonuses: string;
}
export interface CSODOTAMapLocationState {
    accountId: number;
    locationId: number;
    completed: boolean;
}
export interface CMsgLeagueAdminList {
    accountIds: number[];
}
export interface CMsgDOTAProfileCard {
    accountId: number;
    slots: CMsgDOTAProfileCard_Slot[];
    badgePoints: number;
    eventId: number;
    recentBattleCupVictory: CMsgBattleCupVictory | undefined;
    rankTier: number;
    leaderboardRank: number;
    isPlusSubscriber: boolean;
    plusOriginalStartDate: number;
    rankTierScore: number;
    leaderboardRankCore: number;
    title: number;
    favoriteTeamPacked: string;
    lifetimeGames: number;
    eventLevel: number;
}
export declare enum CMsgDOTAProfileCard_EStatID {
    k_eStat_Wins = 3,
    k_eStat_Commends = 4,
    k_eStat_GamesPlayed = 5,
    k_eStat_FirstMatchDate = 6,
    k_eStat_PreviousSeasonRank = 7,
    k_eStat_GamesMVP = 8
}
export declare function cMsgDOTAProfileCard_EStatIDFromJSON(object: any): CMsgDOTAProfileCard_EStatID;
export declare function cMsgDOTAProfileCard_EStatIDToJSON(object: CMsgDOTAProfileCard_EStatID): string;
export interface CMsgDOTAProfileCard_Slot {
    slotId: number;
    trophy: CMsgDOTAProfileCard_Slot_Trophy | undefined;
    stat: CMsgDOTAProfileCard_Slot_Stat | undefined;
    item: CMsgDOTAProfileCard_Slot_Item | undefined;
    hero: CMsgDOTAProfileCard_Slot_Hero | undefined;
    emoticon: CMsgDOTAProfileCard_Slot_Emoticon | undefined;
    team: CMsgDOTAProfileCard_Slot_Team | undefined;
}
export interface CMsgDOTAProfileCard_Slot_Trophy {
    trophyId: number;
    trophyScore: number;
}
export interface CMsgDOTAProfileCard_Slot_Stat {
    statId: CMsgDOTAProfileCard_EStatID;
    statScore: number;
}
export interface CMsgDOTAProfileCard_Slot_Item {
    serializedItem: Buffer;
    itemId: string;
}
export interface CMsgDOTAProfileCard_Slot_Hero {
    heroId: number;
    heroWins: number;
    heroLosses: number;
}
export interface CMsgDOTAProfileCard_Slot_Emoticon {
    emoticonId: number;
}
export interface CMsgDOTAProfileCard_Slot_Team {
    teamId: number;
}
export interface CSODOTAPlayerChallenge {
    accountId: number;
    eventId: number;
    slotId: number;
    intParam0: number;
    intParam1: number;
    createdTime: number;
    completed: number;
    sequenceId: number;
    challengeTier: number;
    flags: number;
    attempts: number;
    completeLimit: number;
    questRank: number;
    maxQuestRank: number;
    instanceId: number;
    heroId: number;
    templateId: number;
}
export interface CMsgClientToGCRerollPlayerChallenge {
    eventId: EEvent;
    sequenceId: number;
    heroId: number;
}
export interface CMsgGCRerollPlayerChallengeResponse {
    result: CMsgGCRerollPlayerChallengeResponse_EResult;
}
export declare enum CMsgGCRerollPlayerChallengeResponse_EResult {
    eResult_Success = 0,
    eResult_Dropped = 1,
    eResult_NotFound = 2,
    eResult_CantReroll = 3,
    eResult_ServerError = 4
}
export declare function cMsgGCRerollPlayerChallengeResponse_EResultFromJSON(object: any): CMsgGCRerollPlayerChallengeResponse_EResult;
export declare function cMsgGCRerollPlayerChallengeResponse_EResultToJSON(object: CMsgGCRerollPlayerChallengeResponse_EResult): string;
export interface CMsgGCTopCustomGamesList {
    topCustomGames: string[];
    gameOfTheDay: string;
}
export interface CMsgDOTARealtimeGameStats {
    match: CMsgDOTARealtimeGameStats_MatchDetails | undefined;
    teams: CMsgDOTARealtimeGameStats_TeamDetails[];
    buildings: CMsgDOTARealtimeGameStats_BuildingDetails[];
    graphData: CMsgDOTARealtimeGameStats_GraphData | undefined;
    deltaFrame: boolean;
}
export interface CMsgDOTARealtimeGameStats_TeamDetails {
    teamNumber: number;
    teamId: number;
    teamName: string;
    teamLogo: string;
    teamTag: string;
    score: number;
    netWorth: number;
    players: CMsgDOTARealtimeGameStats_PlayerDetails[];
    onlyTeam: boolean;
    cheers: number;
    teamLogoUrl: string;
}
export interface CMsgDOTARealtimeGameStats_ItemDetails {
    itemAbilityId: number;
    name: string;
    time: number;
    sold: boolean;
    stackcount: number;
}
export interface CMsgDOTARealtimeGameStats_AbilityDetails {
    id: number;
    name: string;
    level: number;
    cooldown: number;
    cooldownMax: number;
}
export interface CMsgDOTARealtimeGameStats_HeroToHeroStats {
    victimid: number;
    kills: number;
    assists: number;
}
export interface CMsgDOTARealtimeGameStats_AbilityList {
    id: number[];
}
export interface CMsgDOTARealtimeGameStats_PlayerDetails {
    accountid: number;
    playerid: number;
    name: string;
    team: number;
    heroid: number;
    healthpoints: number;
    maxhealthpoints: number;
    healthregenrate: number;
    manapoints: number;
    maxmanapoints: number;
    manaregenrate: number;
    baseStrength: number;
    baseAgility: number;
    baseIntelligence: number;
    baseArmor: number;
    baseMovespeed: number;
    baseDamage: number;
    strength: number;
    agility: number;
    intelligence: number;
    armor: number;
    movespeed: number;
    damage: number;
    heroDamage: number;
    towerDamage: number;
    abilities: CMsgDOTARealtimeGameStats_AbilityDetails[];
    level: number;
    killCount: number;
    deathCount: number;
    assistsCount: number;
    deniesCount: number;
    lhCount: number;
    heroHealing: number;
    goldPerMin: number;
    xpPerMin: number;
    netGold: number;
    gold: number;
    x: number;
    y: number;
    respawnTime: number;
    ultimateCooldown: number;
    hasBuyback: boolean;
    items: CMsgDOTARealtimeGameStats_ItemDetails[];
    stashitems: CMsgDOTARealtimeGameStats_ItemDetails[];
    itemshoppinglist: CMsgDOTARealtimeGameStats_ItemDetails[];
    levelpoints: CMsgDOTARealtimeGameStats_AbilityList[];
    heroToHeroStats: CMsgDOTARealtimeGameStats_HeroToHeroStats[];
    hasUltimate: boolean;
    hasUltimateMana: boolean;
    teamSlot: number;
}
export interface CMsgDOTARealtimeGameStats_BuildingDetails {
    team: number;
    heading: number;
    lane: number;
    tier: number;
    type: number;
    x: number;
    y: number;
    destroyed: boolean;
}
export interface CMsgDOTARealtimeGameStats_KillDetails {
    playerId: number;
    deathTime: number;
    killerPlayerId: number;
}
export interface CMsgDOTARealtimeGameStats_BroadcasterDetails {
    playerId: number;
}
export interface CMsgDOTARealtimeGameStats_PickBanDetails {
    hero: number;
    team: number;
}
export interface CMsgDOTARealtimeGameStats_MatchDetails {
    serverSteamId: string;
    matchId: string;
    timestamp: number;
    timeOfDay: number;
    isNightstalkerNight: boolean;
    gameTime: number;
    gameState: number;
    teamidRadiant: number;
    teamidDire: number;
    picks: CMsgDOTARealtimeGameStats_PickBanDetails[];
    bans: CMsgDOTARealtimeGameStats_PickBanDetails[];
    kills: CMsgDOTARealtimeGameStats_KillDetails[];
    broadcasters: CMsgDOTARealtimeGameStats_BroadcasterDetails[];
    gameMode: number;
    leagueId: number;
    leagueNodeId: number;
    singleTeam: boolean;
    cheersPeak: number;
    lobbyType: number;
    startTimestamp: number;
}
export interface CMsgDOTARealtimeGameStats_GraphData {
    graphGold: number[];
    graphXp: number[];
    graphKill: number[];
    graphTower: number[];
    graphRax: number[];
    teamLocStats: CMsgDOTARealtimeGameStats_GraphData_TeamLocationStats[];
}
export declare enum CMsgDOTARealtimeGameStats_GraphData_eStat {
    CreepGoldEarned = 0,
    KillGoldEarned = 1,
    DeathAndBuybackGoldLost = 2,
    XPEarned = 3
}
export declare function cMsgDOTARealtimeGameStats_GraphData_eStatFromJSON(object: any): CMsgDOTARealtimeGameStats_GraphData_eStat;
export declare function cMsgDOTARealtimeGameStats_GraphData_eStatToJSON(object: CMsgDOTARealtimeGameStats_GraphData_eStat): string;
export declare enum CMsgDOTARealtimeGameStats_GraphData_eLocation {
    BotLane = 0,
    MidLane = 1,
    TopLane = 2,
    Jungle = 3,
    Ancients = 4,
    Other = 5
}
export declare function cMsgDOTARealtimeGameStats_GraphData_eLocationFromJSON(object: any): CMsgDOTARealtimeGameStats_GraphData_eLocation;
export declare function cMsgDOTARealtimeGameStats_GraphData_eLocationToJSON(object: CMsgDOTARealtimeGameStats_GraphData_eLocation): string;
export interface CMsgDOTARealtimeGameStats_GraphData_LocationStats {
    stats: number[];
}
export interface CMsgDOTARealtimeGameStats_GraphData_TeamLocationStats {
    locStats: CMsgDOTARealtimeGameStats_GraphData_LocationStats[];
}
export interface CMsgDOTARealtimeGameStatsTerse {
    match: CMsgDOTARealtimeGameStatsTerse_MatchDetails | undefined;
    teams: CMsgDOTARealtimeGameStatsTerse_TeamDetails[];
    buildings: CMsgDOTARealtimeGameStatsTerse_BuildingDetails[];
    graphData: CMsgDOTARealtimeGameStatsTerse_GraphData | undefined;
    deltaFrame: boolean;
}
export interface CMsgDOTARealtimeGameStatsTerse_TeamDetails {
    teamNumber: number;
    teamId: number;
    teamName: string;
    teamTag: string;
    teamLogo: string;
    score: number;
    netWorth: number;
    teamLogoUrl: string;
    players: CMsgDOTARealtimeGameStatsTerse_PlayerDetails[];
}
export interface CMsgDOTARealtimeGameStatsTerse_PlayerDetails {
    accountid: number;
    playerid: number;
    name: string;
    team: number;
    heroid: number;
    level: number;
    killCount: number;
    deathCount: number;
    assistsCount: number;
    deniesCount: number;
    lhCount: number;
    gold: number;
    x: number;
    y: number;
    netWorth: number;
    abilities: number[];
    items: number[];
    teamSlot: number;
}
export interface CMsgDOTARealtimeGameStatsTerse_BuildingDetails {
    team: number;
    heading: number;
    type: number;
    lane: number;
    tier: number;
    x: number;
    y: number;
    destroyed: boolean;
}
export interface CMsgDOTARealtimeGameStatsTerse_PickBanDetails {
    hero: number;
    team: number;
}
export interface CMsgDOTARealtimeGameStatsTerse_MatchDetails {
    serverSteamId: string;
    matchId: string;
    timestamp: number;
    gameTime: number;
    steamBroadcasterAccountIds: number[];
    gameMode: number;
    leagueId: number;
    leagueNodeId: number;
    gameState: number;
    picks: CMsgDOTARealtimeGameStatsTerse_PickBanDetails[];
    bans: CMsgDOTARealtimeGameStatsTerse_PickBanDetails[];
    lobbyType: number;
    startTimestamp: number;
}
export interface CMsgDOTARealtimeGameStatsTerse_GraphData {
    graphGold: number[];
}
export interface CMsgDOTABroadcastTimelineEvent {
    event: EBroadcastTimelineEvent;
    timestamp: number;
    data: number;
    stringData: string;
}
export interface CMsgGCToClientMatchGroupsVersion {
    matchgroupsVersion: number;
}
export interface CMsgDOTASDOHeroStatsHistory {
    matchId: string;
    gameMode: number;
    lobbyType: number;
    startTime: number;
    won: boolean;
    gpm: number;
    xpm: number;
    kills: number;
    deaths: number;
    assists: number;
}
export interface CMsgPredictionChoice {
    value: number;
    name: string;
    minRawValue: number;
    maxRawValue: number;
}
export interface CMsgInGamePrediction {
    id: number;
    name: string;
    type: CMsgInGamePrediction_EPredictionType;
    group: CMsgInGamePrediction_ERandomSelectionGroupT;
    question: string;
    choices: CMsgPredictionChoice[];
    requiredHeroes: string[];
    queryName: string;
    queryValues: CMsgInGamePrediction_QueryKeyValues[];
    answerResolutionType: CMsgInGamePrediction_EResolutionTypeT;
    pointsToGrant: number;
    rewardAction: number;
    debugForceSelection: number;
    rawValueType: CMsgInGamePrediction_ERawValueTypeT;
}
export declare enum CMsgInGamePrediction_ERawValueTypeT {
    Number = 0,
    Time = 1
}
export declare function cMsgInGamePrediction_ERawValueTypeTFromJSON(object: any): CMsgInGamePrediction_ERawValueTypeT;
export declare function cMsgInGamePrediction_ERawValueTypeTToJSON(object: CMsgInGamePrediction_ERawValueTypeT): string;
export declare enum CMsgInGamePrediction_EPredictionType {
    Generic = 0,
    Hero = 1,
    Team = 2,
    Player = 3,
    Special = 4,
    YesNo = 5,
    QualifiersTeam = 6
}
export declare function cMsgInGamePrediction_EPredictionTypeFromJSON(object: any): CMsgInGamePrediction_EPredictionType;
export declare function cMsgInGamePrediction_EPredictionTypeToJSON(object: CMsgInGamePrediction_EPredictionType): string;
export declare enum CMsgInGamePrediction_EResolutionTypeT {
    InvalidQuery = 0,
    FirstToPassQuery = 1,
    LastToPassQuery = 2,
    LastRemainingQuery = 3,
    MaxToPassQuery = 4,
    MinToPassQuery = 5,
    SumQuery = 6,
    MaxTeamSumToPassQuery = 7,
    MinTeamSumToPassQuery = 8
}
export declare function cMsgInGamePrediction_EResolutionTypeTFromJSON(object: any): CMsgInGamePrediction_EResolutionTypeT;
export declare function cMsgInGamePrediction_EResolutionTypeTToJSON(object: CMsgInGamePrediction_EResolutionTypeT): string;
export declare enum CMsgInGamePrediction_ERandomSelectionGroupT {
    EarlyGame = 0,
    MidGame = 1,
    LateGame = 2,
    Count = 3
}
export declare function cMsgInGamePrediction_ERandomSelectionGroupTFromJSON(object: any): CMsgInGamePrediction_ERandomSelectionGroupT;
export declare function cMsgInGamePrediction_ERandomSelectionGroupTToJSON(object: CMsgInGamePrediction_ERandomSelectionGroupT): string;
export interface CMsgInGamePrediction_QueryKeyValues {
    name: string;
    value: string;
}
export interface CMsgDOTASeasonPredictions {
    predictions: CMsgDOTASeasonPredictions_Prediction[];
    inGamePredictions: CMsgInGamePrediction[];
    inGamePredictionCountPerGame: number;
    inGamePredictionVotingPeriodMinutes: number;
}
export interface CMsgDOTASeasonPredictions_Prediction {
    type: CMsgDOTASeasonPredictions_Prediction_EPredictionType;
    question: string;
    choices: CMsgPredictionChoice[];
    selectionId: number;
    startDate: number;
    lockDate: number;
    reward: number;
    answerType: CMsgDOTASeasonPredictions_Prediction_EAnswerType;
    answerId: number;
    answers: CMsgDOTASeasonPredictions_Prediction_Answers[];
    queryName: string;
    lockOnSelectionId: number;
    lockOnSelectionValue: number;
    lockOnSelectionSet: boolean;
    useAnswerValueRanges: boolean;
    region: ELeagueRegion;
    phases: ELeaguePhase[];
    rewardEvent: EEvent;
    leagueNodeId: number;
}
export declare enum CMsgDOTASeasonPredictions_Prediction_EPredictionType {
    Generic = 0,
    Hero = 1,
    Team = 2,
    Player = 3,
    Special = 4,
    YesNo = 5,
    QualifiersTeam = 6,
    LastChanceTeam = 7
}
export declare function cMsgDOTASeasonPredictions_Prediction_EPredictionTypeFromJSON(object: any): CMsgDOTASeasonPredictions_Prediction_EPredictionType;
export declare function cMsgDOTASeasonPredictions_Prediction_EPredictionTypeToJSON(object: CMsgDOTASeasonPredictions_Prediction_EPredictionType): string;
export declare enum CMsgDOTASeasonPredictions_Prediction_EAnswerType {
    SingleInt = 0,
    SingleFloat = 1,
    MultipleInt = 2,
    MultipleFloat = 3,
    AnswerTeam = 4,
    SingleTime = 5,
    MultipleTime = 6,
    NoAnswer = 7
}
export declare function cMsgDOTASeasonPredictions_Prediction_EAnswerTypeFromJSON(object: any): CMsgDOTASeasonPredictions_Prediction_EAnswerType;
export declare function cMsgDOTASeasonPredictions_Prediction_EAnswerTypeToJSON(object: CMsgDOTASeasonPredictions_Prediction_EAnswerType): string;
export interface CMsgDOTASeasonPredictions_Prediction_Answers {
    answerId: number;
}
export interface CMsgAvailablePredictions {
    matchPredictions: CMsgAvailablePredictions_MatchPrediction[];
}
export interface CMsgAvailablePredictions_MatchPrediction {
    matchId: string;
    predictions: CMsgInGamePrediction[];
}
export interface CMsgLeagueWatchedGames {
    leagues: CMsgLeagueWatchedGames_League[];
}
export interface CMsgLeagueWatchedGames_Series {
    nodeId: number;
    game: number[];
}
export interface CMsgLeagueWatchedGames_League {
    leagueId: number;
    series: CMsgLeagueWatchedGames_Series[];
}
export interface CMsgDOTAMatch {
    duration: number;
    starttime: number;
    players: CMsgDOTAMatch_Player[];
    matchId: string;
    towerStatus: number[];
    barracksStatus: number[];
    cluster: number;
    firstBloodTime: number;
    replaySalt: number;
    serverIp: number;
    serverPort: number;
    lobbyType: number;
    humanPlayers: number;
    averageSkill: number;
    gameBalance: number;
    radiantTeamId: number;
    direTeamId: number;
    leagueid: number;
    radiantTeamName: string;
    direTeamName: string;
    radiantTeamLogo: string;
    direTeamLogo: string;
    radiantTeamLogoUrl: string;
    direTeamLogoUrl: string;
    radiantTeamComplete: number;
    direTeamComplete: number;
    gameMode: DOTAGameMode;
    picksBans: CMatchHeroSelectEvent[];
    matchSeqNum: string;
    replayState: CMsgDOTAMatch_ReplayState;
    radiantGuildId: number;
    direGuildId: number;
    radiantTeamTag: string;
    direTeamTag: string;
    seriesId: number;
    seriesType: number;
    broadcasterChannels: CMsgDOTAMatch_BroadcasterChannel[];
    engine: number;
    customGameData: CMsgDOTAMatch_CustomGameData | undefined;
    matchFlags: number;
    privateMetadataKey: number;
    radiantTeamScore: number;
    direTeamScore: number;
    matchOutcome: EMatchOutcome;
    tournamentId: number;
    tournamentRound: number;
    preGameDuration: number;
    coaches: CMsgDOTAMatch_Coach[];
}
export declare enum CMsgDOTAMatch_ReplayState {
    REPLAY_AVAILABLE = 0,
    REPLAY_NOT_RECORDED = 1,
    REPLAY_EXPIRED = 2
}
export declare function cMsgDOTAMatch_ReplayStateFromJSON(object: any): CMsgDOTAMatch_ReplayState;
export declare function cMsgDOTAMatch_ReplayStateToJSON(object: CMsgDOTAMatch_ReplayState): string;
export interface CMsgDOTAMatch_Player {
    accountId: number;
    playerSlot: number;
    heroId: number;
    item0: number;
    item1: number;
    item2: number;
    item3: number;
    item4: number;
    item5: number;
    item6: number;
    item7: number;
    item8: number;
    item9: number;
    expectedTeamContribution: number;
    scaledMetric: number;
    previousRank: number;
    rankChange: number;
    mmrType: number;
    kills: number;
    deaths: number;
    assists: number;
    leaverStatus: number;
    gold: number;
    lastHits: number;
    denies: number;
    goldPerMin: number;
    xpPerMin: number;
    goldSpent: number;
    heroDamage: number;
    towerDamage: number;
    heroHealing: number;
    level: number;
    timeLastSeen: number;
    playerName: string;
    supportAbilityValue: number;
    feedingDetected: boolean;
    searchRank: number;
    searchRankUncertainty: number;
    rankUncertaintyChange: number;
    heroPlayCount: number;
    partyId: string;
    scaledHeroDamage: number;
    scaledTowerDamage: number;
    scaledHeroHealing: number;
    scaledKills: number;
    scaledDeaths: number;
    scaledAssists: number;
    claimedFarmGold: number;
    supportGold: number;
    claimedDenies: number;
    claimedMisses: number;
    misses: number;
    abilityUpgrades: CMatchPlayerAbilityUpgrade[];
    additionalUnitsInventory: CMatchAdditionalUnitInventory[];
    permanentBuffs: CMatchPlayerPermanentBuff[];
    proName: string;
    realName: string;
    customGameData: CMsgDOTAMatch_Player_CustomGameData | undefined;
    activePlusSubscription: boolean;
    netWorth: number;
    botDifficulty: number;
    heroPickOrder: number;
    heroWasRandomed: boolean;
    heroWasDotaPlusSuggestion: boolean;
    heroDamageReceived: CMsgDOTAMatch_Player_HeroDamageReceived[];
    heroDamageDealt: CMsgDOTAMatch_Player_HeroDamageReceived[];
    secondsDead: number;
    goldLostToDeath: number;
    laneSelectionFlags: number;
    bountyRunes: number;
    outpostsCaptured: number;
    teamNumber: dotaGcTeam;
    teamSlot: number;
    selectedFacet: number;
}
export declare enum CMsgDOTAMatch_Player_HeroDamageType {
    HERO_DAMAGE_PHYSICAL = 0,
    HERO_DAMAGE_MAGICAL = 1,
    HERO_DAMAGE_PURE = 2
}
export declare function cMsgDOTAMatch_Player_HeroDamageTypeFromJSON(object: any): CMsgDOTAMatch_Player_HeroDamageType;
export declare function cMsgDOTAMatch_Player_HeroDamageTypeToJSON(object: CMsgDOTAMatch_Player_HeroDamageType): string;
export interface CMsgDOTAMatch_Player_CustomGameData {
    dotaTeam: number;
    winner: boolean;
}
export interface CMsgDOTAMatch_Player_HeroDamageReceived {
    preReduction: number;
    postReduction: number;
    damageType: CMsgDOTAMatch_Player_HeroDamageType;
}
export interface CMsgDOTAMatch_BroadcasterInfo {
    accountId: number;
    name: string;
}
export interface CMsgDOTAMatch_BroadcasterChannel {
    countryCode: string;
    description: string;
    broadcasterInfos: CMsgDOTAMatch_BroadcasterInfo[];
    languageCode: string;
}
export interface CMsgDOTAMatch_Coach {
    accountId: number;
    coachName: string;
    coachRating: number;
    coachTeam: number;
    coachPartyId: string;
    isPrivateCoach: boolean;
}
export interface CMsgDOTAMatch_CustomGameData {
    customGameId: string;
    mapName: string;
}
export interface CMsgPlayerCard {
    accountId: number;
    statModifier: CMsgPlayerCard_StatModifier[];
}
export interface CMsgPlayerCard_StatModifier {
    stat: number;
    value: number;
}
export interface CMsgDOTAFantasyPlayerStats {
    playerAccountId: number;
    matchId: string;
    matchCompleted: boolean;
    teamId: number;
    leagueId: number;
    delay: number;
    seriesId: number;
    seriesType: number;
    kills: number;
    deaths: number;
    cs: number;
    gpm: number;
    towerKills: number;
    roshanKills: number;
    teamfightParticipation: number;
    wardsPlaced: number;
    campsStacked: number;
    runesGrabbed: number;
    firstBlood: number;
    stuns: number;
    smokes: number;
    neutralTokens: number;
    watchers: number;
    lotuses: number;
    tormentors: number;
    courierKills: number;
    titleStats: string;
}
export interface CMsgDOTAFantasyPlayerMatchStats {
    matches: CMsgDOTAFantasyPlayerStats[];
}
export interface CMsgDOTABotDebugInfo {
    bots: CMsgDOTABotDebugInfo_Bot[];
    desirePushLaneTop: number;
    desirePushLaneMid: number;
    desirePushLaneBot: number;
    desireDefendLaneTop: number;
    desireDefendLaneMid: number;
    desireDefendLaneBot: number;
    desireFarmLaneTop: number;
    desireFarmLaneMid: number;
    desireFarmLaneBot: number;
    desireFarmRoshan: number;
    executionTime: number;
    runeStatus: number[];
}
export interface CMsgDOTABotDebugInfo_Bot {
    playerOwnerId: number;
    heroId: number;
    difficulty: number;
    powerCurrent: number;
    powerMax: number;
    moveTargetX: number;
    moveTargetY: number;
    moveTargetZ: number;
    activeModeId: number;
    executionTime: number;
    modes: CMsgDOTABotDebugInfo_Bot_Mode[];
    action: CMsgDOTABotDebugInfo_Bot_Action | undefined;
}
export interface CMsgDOTABotDebugInfo_Bot_Mode {
    modeId: number;
    desire: number;
    targetEntity: number;
    targetX: number;
    targetY: number;
    targetZ: number;
}
export interface CMsgDOTABotDebugInfo_Bot_Action {
    actionId: number;
    actionTarget: string;
}
export interface CMsgSuccessfulHero {
    heroId: number;
    winPercent: number;
    longestStreak: number;
}
export interface CMsgRecentMatchInfo {
    matchId: string;
    gameMode: DOTAGameMode;
    kills: number;
    deaths: number;
    assists: number;
    duration: number;
    playerSlot: number;
    matchOutcome: EMatchOutcome;
    timestamp: number;
    lobbyType: number;
    teamNumber: number;
}
export interface CMsgMatchTips {
    tips: CMsgMatchTips_SingleTip[];
}
export interface CMsgMatchTips_SingleTip {
    sourceAccountId: number;
    targetAccountId: number;
    tipAmount: number;
    eventId: EEvent;
}
export interface CMsgDOTAMatchMinimal {
    matchId: string;
    startTime: number;
    duration: number;
    gameMode: DOTAGameMode;
    players: CMsgDOTAMatchMinimal_Player[];
    tourney: CMsgDOTAMatchMinimal_Tourney | undefined;
    matchOutcome: EMatchOutcome;
    radiantScore: number;
    direScore: number;
    lobbyType: number;
}
export interface CMsgDOTAMatchMinimal_Player {
    accountId: number;
    heroId: number;
    kills: number;
    deaths: number;
    assists: number;
    items: number[];
    playerSlot: number;
    proName: string;
    level: number;
    teamNumber: dotaGcTeam;
}
export interface CMsgDOTAMatchMinimal_Tourney {
    leagueId: number;
    seriesType: number;
    seriesGame: number;
    weekendTourneyTournamentId: number;
    weekendTourneySeasonTrophyId: number;
    weekendTourneyDivision: number;
    weekendTourneySkillLevel: number;
    radiantTeamId: number;
    radiantTeamName: string;
    radiantTeamLogo: string;
    radiantTeamLogoUrl: string;
    direTeamId: number;
    direTeamName: string;
    direTeamLogo: string;
    direTeamLogoUrl: string;
}
export interface CMsgConsumableUsage {
    itemDef: number;
    quantityChange: number;
}
export interface CMsgMatchConsumableUsage {
    playerConsumablesUsed: CMsgMatchConsumableUsage_PlayerUsage[];
}
export interface CMsgMatchConsumableUsage_PlayerUsage {
    accountId: number;
    consumablesUsed: CMsgConsumableUsage[];
}
export interface CMsgMatchEventActionGrants {
    playerGrants: CMsgMatchEventActionGrants_PlayerGrants[];
}
export interface CMsgMatchEventActionGrants_PlayerGrants {
    accountId: number;
    actionsGranted: CMsgPendingEventAward[];
}
export interface CMsgCustomGameWhitelist {
    version: number;
    customGamesWhitelist: string[];
    disableWhitelist: boolean;
}
export interface CMsgCustomGameWhitelistForEdit {
    whitelistEntries: CMsgCustomGameWhitelistForEdit_WhitelistEntry[];
}
export interface CMsgCustomGameWhitelistForEdit_WhitelistEntry {
    customGameId: string;
    whitelistState: ECustomGameWhitelistState;
}
export interface CMsgPlayerRecentMatchInfo {
    matchId: string;
    timestamp: number;
    duration: number;
    win: boolean;
    heroId: number;
    kills: number;
    deaths: number;
    assists: number;
}
export interface CMsgPlayerMatchRecord {
    wins: number;
    losses: number;
}
export interface CMsgPlayerRecentMatchOutcomes {
    outcomes: number;
    matchCount: number;
}
export interface CMsgPlayerRecentCommends {
    commends: number;
    matchCount: number;
}
export interface CMsgPlayerRecentAccomplishments {
    recentOutcomes: CMsgPlayerRecentMatchOutcomes | undefined;
    totalRecord: CMsgPlayerMatchRecord | undefined;
    predictionStreak: number;
    plusPredictionStreak: number;
    recentCommends: CMsgPlayerRecentCommends | undefined;
    firstMatchTimestamp: number;
    lastMatch: CMsgPlayerRecentMatchInfo | undefined;
    recentMvps: CMsgPlayerRecentMatchOutcomes | undefined;
}
export interface CMsgPlayerHeroRecentAccomplishments {
    recentOutcomes: CMsgPlayerRecentMatchOutcomes | undefined;
    totalRecord: CMsgPlayerMatchRecord | undefined;
    lastMatch: CMsgPlayerRecentMatchInfo | undefined;
}
export interface CMsgRecentAccomplishments {
    playerAccomplishments: CMsgPlayerRecentAccomplishments | undefined;
    heroAccomplishments: CMsgPlayerHeroRecentAccomplishments | undefined;
}
export interface CMsgServerToGCRequestPlayerRecentAccomplishments {
    accountId: number;
    heroId: number;
}
export interface CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse {
    result: CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponse;
    playerAccomplishments: CMsgRecentAccomplishments | undefined;
}
export declare enum CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3
}
export declare function cMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponseFromJSON(object: any): CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponse;
export declare function cMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponseToJSON(object: CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse_EResponse): string;
export interface CMsgArcanaVoteMatchVotes {
    matchId: number;
    heroId: number;
    voteCount: number;
}
export interface CMsgGCtoGCAssociatedExploiterAccountInfo {
    accountId: number;
    numMatchesToSearch: number;
    minSharedMatchCount: number;
    numAdditionalPlayers: number;
}
export interface CMsgGCtoGCAssociatedExploiterAccountInfoResponse {
    accounts: CMsgGCtoGCAssociatedExploiterAccountInfoResponse_Account[];
}
export interface CMsgGCtoGCAssociatedExploiterAccountInfoResponse_Account {
    accountId: number;
    numCommonMatches: number;
    earliestCommonMatch: number;
    latestCommonMatch: number;
    generation: number;
    persona: string;
    alreadyBanned: boolean;
}
export interface CMsgPullTabsData {
    slots: CMsgPullTabsData_Slot[];
    jackpots: CMsgPullTabsData_Jackpot[];
    lastBoard: number;
}
export interface CMsgPullTabsData_Slot {
    eventId: number;
    boardId: number;
    heroId: number;
    actionId: number;
    redeemed: boolean;
}
export interface CMsgPullTabsData_Jackpot {
    boardId: number;
    actionId: number;
    heroId: number;
}
export interface CMsgUnderDraftData {
    benchSlots: CMsgUnderDraftData_BenchSlot[];
    shopSlots: CMsgUnderDraftData_ShopSlot[];
    gold: number;
    totalGold: number;
    notRestorable: boolean;
}
export interface CMsgUnderDraftData_BenchSlot {
    slotId: number;
    heroId: number;
    stars: number;
}
export interface CMsgUnderDraftData_ShopSlot {
    slotId: number;
    heroId: number;
    isSpecialReward: boolean;
}
export interface CMsgPlayerTitleData {
    title: number[];
    eventId: number[];
    active: number;
}
export interface CMsgDOTATriviaQuestion {
    questionId: number;
    category: EDOTATriviaQuestionCategory;
    timestamp: number;
    questionValue: string;
    answerValues: string[];
    correctAnswerIndex: number;
}
export interface CMsgDOTATriviaQuestionAnswersSummary {
    summaryAvailable: boolean;
    pickedCount: number[];
}
export interface CMsgGameDataSpecialValueBonus {
    name: string;
    value: number;
    operation: number;
}
export interface CMsgGameDataSpecialValues {
    name: string;
    valuesFloat: number[];
    isPercentage: boolean;
    headingLoc: string;
    bonuses: CMsgGameDataSpecialValueBonus[];
    valuesShard: number[];
    valuesScepter: number[];
    facetBonus: CMsgGameDataFacetAbilityBonus | undefined;
    requiredFacet: string;
}
export interface CMsgGameDataFacetAbilityBonus {
    name: string;
    values: number[];
    operation: number;
}
export interface CMsgGameDataAbilityOrItem {
    id: number;
    name: string;
    nameLoc: string;
    descLoc: string;
    loreLoc: string;
    notesLoc: string[];
    shardLoc: string;
    scepterLoc: string;
    facetsLoc: string[];
    type: number;
    behavior: string;
    targetTeam: number;
    targetType: number;
    flags: number;
    damage: number;
    immunity: number;
    dispellable: number;
    maxLevel: number;
    castRanges: number[];
    castPoints: number[];
    channelTimes: number[];
    cooldowns: number[];
    durations: number[];
    damages: number[];
    manaCosts: number[];
    goldCosts: number[];
    healthCosts: number[];
    specialValues: CMsgGameDataSpecialValues[];
    isItem: boolean;
    abilityHasScepter: boolean;
    abilityHasShard: boolean;
    abilityIsGrantedByScepter: boolean;
    abilityIsGrantedByShard: boolean;
    abilityIsInnate: boolean;
    itemCost: number;
    itemInitialCharges: number;
    itemNeutralTier: number;
    itemStockMax: number;
    itemStockTime: number;
    itemQuality: number;
}
export interface CMsgGameDataAbilityOrItemList {
    abilities: CMsgGameDataAbilityOrItem[];
}
export interface CMsgGameDataHero {
    id: number;
    name: string;
    orderId: number;
    nameLoc: string;
    bioLoc: string;
    hypeLoc: string;
    npeDescLoc: string;
    facets: CMsgGameDataHero_Facet[];
    strBase: number;
    strGain: number;
    agiBase: number;
    agiGain: number;
    intBase: number;
    intGain: number;
    primaryAttr: number;
    complexity: number;
    attackCapability: number;
    roleLevels: number[];
    damageMin: number;
    damageMax: number;
    attackRate: number;
    attackRange: number;
    projectileSpeed: number;
    armor: number;
    magicResistance: number;
    movementSpeed: number;
    turnRate: number;
    sightRangeDay: number;
    sightRangeNight: number;
    maxHealth: number;
    healthRegen: number;
    maxMana: number;
    manaRegen: number;
    abilities: CMsgGameDataAbilityOrItem[];
    talents: CMsgGameDataAbilityOrItem[];
    facetAbilities: CMsgGameDataAbilityOrItemList[];
}
export interface CMsgGameDataHero_Facet {
    color: number;
    titleLoc: string;
    descriptionLoc: string;
    name: string;
    icon: string;
    gradientId: number;
}
export interface CMsgGameDataAbilities {
    abilities: CMsgGameDataAbilityOrItem[];
}
export interface CMsgGameDataItems {
    items: CMsgGameDataAbilityOrItem[];
}
export interface CMsgGameDataHeroes {
    heroes: CMsgGameDataHero[];
}
export interface CMsgGameDataHeroList {
    heroes: CMsgGameDataHeroList_HeroInfo[];
}
export interface CMsgGameDataHeroList_HeroInfo {
    id: number;
    name: string;
    nameLoc: string;
    nameEnglishLoc: string;
    primaryAttr: number;
    complexity: number;
}
export interface CMsgGameDataItemAbilityList {
    itemabilities: CMsgGameDataItemAbilityList_ItemAbilityInfo[];
}
export interface CMsgGameDataItemAbilityList_ItemAbilityInfo {
    id: number;
    name: string;
    nameLoc: string;
    nameEnglishLoc: string;
    neutralItemTier: number;
    isPregameSuggested: boolean;
    isEarlygameSuggested: boolean;
    isLategameSuggested: boolean;
    recipes: CMsgGameDataItemAbilityList_ItemAbilityInfo_Recipe[];
}
export interface CMsgGameDataItemAbilityList_ItemAbilityInfo_Recipe {
    items: number[];
}
export interface CMsgLobbyAbilityDraftData {
    shuffleDraftOrder: boolean;
}
export interface CSOEconItemDropRateBonus {
    accountId: number;
    expirationDate: number;
    bonus: number;
    bonusCount: number;
    itemId: string;
    defIndex: number;
    secondsLeft: number;
    boosterType: number;
}
export interface CSOEconItemTournamentPassport {
    accountId: number;
    leagueId: number;
    itemId: string;
    originalPurchaserId: number;
    passportsBought: number;
    version: number;
    defIndex: number;
    rewardFlags: number;
}
export interface CMsgStickerbookSticker {
    itemDefId: number;
    stickerNum: number;
    quality: number;
    positionX: number;
    positionY: number;
    positionZ: number;
    rotation: number;
    scale: number;
    sourceItemId: string;
    depthBias: number;
}
export interface CMsgStickerbookPage {
    pageNum: number;
    eventId: EEvent;
    teamId: number;
    stickers: CMsgStickerbookSticker[];
    pageType: EStickerbookPageType;
}
export interface CMsgStickerbookTeamPageOrderSequence {
    pageNumbers: number[];
}
export interface CMsgStickerbook {
    pages: CMsgStickerbookPage[];
    teamPageOrderSequence: CMsgStickerbookTeamPageOrderSequence | undefined;
    favoritePageNum: number;
}
export interface CMsgStickerHero {
    heroId: number;
    itemDefId: number;
    quality: number;
    sourceItemId: string;
}
export interface CMsgStickerHeroes {
    heroes: CMsgStickerHero[];
}
export interface CMsgHeroRoleStats {
    laneSelectionFlags: number;
    matchCount: number;
    winCount: number;
}
export interface CMsgHeroRoleHeroStats {
    heroId: number;
    roleStats: CMsgHeroRoleStats[];
}
export interface CMsgHeroRoleRankStats {
    rankTier: number;
    heroStats: CMsgHeroRoleHeroStats[];
}
export interface CMsgHeroRoleAllRanksStats {
    startTimestamp: number;
    endTimestamp: number;
    rankStats: CMsgHeroRoleRankStats[];
}
export interface CMsgMapStatsSnapshot {
    timestamp: number;
    lotusesGained: string;
    wisdomRunesGained: string;
    roshanKillsDay: string;
    roshanKillsNight: string;
    portalsUsed: string;
    watchersTaken: string;
    tormentorKills: string;
    outpostsCaptured: string;
    shieldRunesGained: string;
}
export interface CMsgGlobalMapStats {
    current: CMsgMapStatsSnapshot | undefined;
    windowStart: CMsgMapStatsSnapshot | undefined;
    windowEnd: CMsgMapStatsSnapshot | undefined;
}
export interface CMsgTrackedStat {
    trackedStatId: number;
    trackedStatValue: number;
}
export interface CMsgDOTAClaimEventActionResponse {
    result: CMsgDOTAClaimEventActionResponse_ResultCode;
    rewardResults: CMsgDOTAClaimEventActionResponse_GrantedRewardData[];
    actionId: number;
}
export declare enum CMsgDOTAClaimEventActionResponse_ResultCode {
    Success = 0,
    InvalidEvent = 1,
    EventNotActive = 2,
    InvalidAction = 3,
    ServerError = 4,
    InsufficientPoints = 5,
    InsufficentLevel = 6,
    AlreadyClaimed = 7,
    SDOLockFailure = 8,
    SDOLoadFailure = 9,
    EventNotOwned = 10,
    Timeout = 11,
    RequiresPlusSubscription = 12,
    InvalidItem = 13,
    AsyncRewards = 14
}
export declare function cMsgDOTAClaimEventActionResponse_ResultCodeFromJSON(object: any): CMsgDOTAClaimEventActionResponse_ResultCode;
export declare function cMsgDOTAClaimEventActionResponse_ResultCodeToJSON(object: CMsgDOTAClaimEventActionResponse_ResultCode): string;
export interface CMsgDOTAClaimEventActionResponse_MysteryItemRewardData {
    itemDef: number;
    itemCategory: number;
}
export interface CMsgDOTAClaimEventActionResponse_LootListRewardData {
    itemDef: number[];
}
export interface CMsgDOTAClaimEventActionResponse_ActionListRewardData {
    actionId: number;
    resultRewardData: Buffer;
}
export interface CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData {
    tokens: CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData_TokenQuantity[];
}
export interface CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData_TokenQuantity {
    tokenId: number;
    tokenCount: number;
}
export interface CMsgDOTAClaimEventActionResponse_GrantedRewardData {
    grantIndex: number;
    scoreIndex: number;
    rewardIndex: number;
    rewardData: Buffer;
    actionId: number;
}
export interface CMsgClientToGCDotaLabsFeedback {
    language: number;
    feedbackItem: number;
    feedback: string;
}
export interface CMsgClientToGCDotaLabsFeedbackResponse {
    response: CMsgClientToGCDotaLabsFeedbackResponse_EResponse;
}
export declare enum CMsgClientToGCDotaLabsFeedbackResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidItem = 6
}
export declare function cMsgClientToGCDotaLabsFeedbackResponse_EResponseFromJSON(object: any): CMsgClientToGCDotaLabsFeedbackResponse_EResponse;
export declare function cMsgClientToGCDotaLabsFeedbackResponse_EResponseToJSON(object: CMsgClientToGCDotaLabsFeedbackResponse_EResponse): string;
export interface CDotaMsgPredictionResult {
    accountId: number;
    matchId: string;
    correct: boolean;
    predictions: CDotaMsgPredictionResult_Prediction[];
}
export interface CDotaMsgPredictionResult_Prediction {
    itemDef: number;
    numCorrect: number;
    numFails: number;
    result: CDotaMsgPredictionResult_Prediction_EResult;
    grantedItemDefs: number[];
}
export declare enum CDotaMsgPredictionResult_Prediction_EResult {
    k_eResult_ItemGranted = 1,
    k_eResult_Destroyed = 2
}
export declare function cDotaMsgPredictionResult_Prediction_EResultFromJSON(object: any): CDotaMsgPredictionResult_Prediction_EResult;
export declare function cDotaMsgPredictionResult_Prediction_EResultToJSON(object: CDotaMsgPredictionResult_Prediction_EResult): string;
export declare const CSODOTAGameAccountClient: MessageFns<CSODOTAGameAccountClient>;
export declare const CSODOTAGameAccountClient_RoleHandicap: MessageFns<CSODOTAGameAccountClient_RoleHandicap>;
export declare const CSODOTAGameAccountPlus: MessageFns<CSODOTAGameAccountPlus>;
export declare const CSODOTAChatWheel: MessageFns<CSODOTAChatWheel>;
export declare const CMsgLobbyFeaturedGamemodeProgress: MessageFns<CMsgLobbyFeaturedGamemodeProgress>;
export declare const CMsgLobbyFeaturedGamemodeProgress_AccountProgress: MessageFns<CMsgLobbyFeaturedGamemodeProgress_AccountProgress>;
export declare const CMsgBattleCupVictory: MessageFns<CMsgBattleCupVictory>;
export declare const CMsgLobbyBattleCupVictoryList: MessageFns<CMsgLobbyBattleCupVictoryList>;
export declare const CMsgDOTABroadcastNotification: MessageFns<CMsgDOTABroadcastNotification>;
export declare const CProtoItemHeroStatue: MessageFns<CProtoItemHeroStatue>;
export declare const CMatchPlayerAbilityUpgrade: MessageFns<CMatchPlayerAbilityUpgrade>;
export declare const CMatchPlayerTimedCustomStat: MessageFns<CMatchPlayerTimedCustomStat>;
export declare const CMatchPlayerTimedStats: MessageFns<CMatchPlayerTimedStats>;
export declare const CMatchTeamTimedStats: MessageFns<CMatchTeamTimedStats>;
export declare const CMatchAdditionalUnitInventory: MessageFns<CMatchAdditionalUnitInventory>;
export declare const CMatchPlayerPermanentBuff: MessageFns<CMatchPlayerPermanentBuff>;
export declare const CMatchHeroSelectEvent: MessageFns<CMatchHeroSelectEvent>;
export declare const CMatchClip: MessageFns<CMatchClip>;
export declare const CPartySearchClientParty: MessageFns<CPartySearchClientParty>;
export declare const CMsgDOTAHasItemQuery: MessageFns<CMsgDOTAHasItemQuery>;
export declare const CMsgDOTAHasItemResponse: MessageFns<CMsgDOTAHasItemResponse>;
export declare const CMsgGCGetPlayerCardItemInfo: MessageFns<CMsgGCGetPlayerCardItemInfo>;
export declare const CMsgGCGetPlayerCardItemInfoResponse: MessageFns<CMsgGCGetPlayerCardItemInfoResponse>;
export declare const CMsgGCGetPlayerCardItemInfoResponse_PlayerCardInfo: MessageFns<CMsgGCGetPlayerCardItemInfoResponse_PlayerCardInfo>;
export declare const CSODOTAMapLocationState: MessageFns<CSODOTAMapLocationState>;
export declare const CMsgLeagueAdminList: MessageFns<CMsgLeagueAdminList>;
export declare const CMsgDOTAProfileCard: MessageFns<CMsgDOTAProfileCard>;
export declare const CMsgDOTAProfileCard_Slot: MessageFns<CMsgDOTAProfileCard_Slot>;
export declare const CMsgDOTAProfileCard_Slot_Trophy: MessageFns<CMsgDOTAProfileCard_Slot_Trophy>;
export declare const CMsgDOTAProfileCard_Slot_Stat: MessageFns<CMsgDOTAProfileCard_Slot_Stat>;
export declare const CMsgDOTAProfileCard_Slot_Item: MessageFns<CMsgDOTAProfileCard_Slot_Item>;
export declare const CMsgDOTAProfileCard_Slot_Hero: MessageFns<CMsgDOTAProfileCard_Slot_Hero>;
export declare const CMsgDOTAProfileCard_Slot_Emoticon: MessageFns<CMsgDOTAProfileCard_Slot_Emoticon>;
export declare const CMsgDOTAProfileCard_Slot_Team: MessageFns<CMsgDOTAProfileCard_Slot_Team>;
export declare const CSODOTAPlayerChallenge: MessageFns<CSODOTAPlayerChallenge>;
export declare const CMsgClientToGCRerollPlayerChallenge: MessageFns<CMsgClientToGCRerollPlayerChallenge>;
export declare const CMsgGCRerollPlayerChallengeResponse: MessageFns<CMsgGCRerollPlayerChallengeResponse>;
export declare const CMsgGCTopCustomGamesList: MessageFns<CMsgGCTopCustomGamesList>;
export declare const CMsgDOTARealtimeGameStats: MessageFns<CMsgDOTARealtimeGameStats>;
export declare const CMsgDOTARealtimeGameStats_TeamDetails: MessageFns<CMsgDOTARealtimeGameStats_TeamDetails>;
export declare const CMsgDOTARealtimeGameStats_ItemDetails: MessageFns<CMsgDOTARealtimeGameStats_ItemDetails>;
export declare const CMsgDOTARealtimeGameStats_AbilityDetails: MessageFns<CMsgDOTARealtimeGameStats_AbilityDetails>;
export declare const CMsgDOTARealtimeGameStats_HeroToHeroStats: MessageFns<CMsgDOTARealtimeGameStats_HeroToHeroStats>;
export declare const CMsgDOTARealtimeGameStats_AbilityList: MessageFns<CMsgDOTARealtimeGameStats_AbilityList>;
export declare const CMsgDOTARealtimeGameStats_PlayerDetails: MessageFns<CMsgDOTARealtimeGameStats_PlayerDetails>;
export declare const CMsgDOTARealtimeGameStats_BuildingDetails: MessageFns<CMsgDOTARealtimeGameStats_BuildingDetails>;
export declare const CMsgDOTARealtimeGameStats_KillDetails: MessageFns<CMsgDOTARealtimeGameStats_KillDetails>;
export declare const CMsgDOTARealtimeGameStats_BroadcasterDetails: MessageFns<CMsgDOTARealtimeGameStats_BroadcasterDetails>;
export declare const CMsgDOTARealtimeGameStats_PickBanDetails: MessageFns<CMsgDOTARealtimeGameStats_PickBanDetails>;
export declare const CMsgDOTARealtimeGameStats_MatchDetails: MessageFns<CMsgDOTARealtimeGameStats_MatchDetails>;
export declare const CMsgDOTARealtimeGameStats_GraphData: MessageFns<CMsgDOTARealtimeGameStats_GraphData>;
export declare const CMsgDOTARealtimeGameStats_GraphData_LocationStats: MessageFns<CMsgDOTARealtimeGameStats_GraphData_LocationStats>;
export declare const CMsgDOTARealtimeGameStats_GraphData_TeamLocationStats: MessageFns<CMsgDOTARealtimeGameStats_GraphData_TeamLocationStats>;
export declare const CMsgDOTARealtimeGameStatsTerse: MessageFns<CMsgDOTARealtimeGameStatsTerse>;
export declare const CMsgDOTARealtimeGameStatsTerse_TeamDetails: MessageFns<CMsgDOTARealtimeGameStatsTerse_TeamDetails>;
export declare const CMsgDOTARealtimeGameStatsTerse_PlayerDetails: MessageFns<CMsgDOTARealtimeGameStatsTerse_PlayerDetails>;
export declare const CMsgDOTARealtimeGameStatsTerse_BuildingDetails: MessageFns<CMsgDOTARealtimeGameStatsTerse_BuildingDetails>;
export declare const CMsgDOTARealtimeGameStatsTerse_PickBanDetails: MessageFns<CMsgDOTARealtimeGameStatsTerse_PickBanDetails>;
export declare const CMsgDOTARealtimeGameStatsTerse_MatchDetails: MessageFns<CMsgDOTARealtimeGameStatsTerse_MatchDetails>;
export declare const CMsgDOTARealtimeGameStatsTerse_GraphData: MessageFns<CMsgDOTARealtimeGameStatsTerse_GraphData>;
export declare const CMsgDOTABroadcastTimelineEvent: MessageFns<CMsgDOTABroadcastTimelineEvent>;
export declare const CMsgGCToClientMatchGroupsVersion: MessageFns<CMsgGCToClientMatchGroupsVersion>;
export declare const CMsgDOTASDOHeroStatsHistory: MessageFns<CMsgDOTASDOHeroStatsHistory>;
export declare const CMsgPredictionChoice: MessageFns<CMsgPredictionChoice>;
export declare const CMsgInGamePrediction: MessageFns<CMsgInGamePrediction>;
export declare const CMsgInGamePrediction_QueryKeyValues: MessageFns<CMsgInGamePrediction_QueryKeyValues>;
export declare const CMsgDOTASeasonPredictions: MessageFns<CMsgDOTASeasonPredictions>;
export declare const CMsgDOTASeasonPredictions_Prediction: MessageFns<CMsgDOTASeasonPredictions_Prediction>;
export declare const CMsgDOTASeasonPredictions_Prediction_Answers: MessageFns<CMsgDOTASeasonPredictions_Prediction_Answers>;
export declare const CMsgAvailablePredictions: MessageFns<CMsgAvailablePredictions>;
export declare const CMsgAvailablePredictions_MatchPrediction: MessageFns<CMsgAvailablePredictions_MatchPrediction>;
export declare const CMsgLeagueWatchedGames: MessageFns<CMsgLeagueWatchedGames>;
export declare const CMsgLeagueWatchedGames_Series: MessageFns<CMsgLeagueWatchedGames_Series>;
export declare const CMsgLeagueWatchedGames_League: MessageFns<CMsgLeagueWatchedGames_League>;
export declare const CMsgDOTAMatch: MessageFns<CMsgDOTAMatch>;
export declare const CMsgDOTAMatch_Player: MessageFns<CMsgDOTAMatch_Player>;
export declare const CMsgDOTAMatch_Player_CustomGameData: MessageFns<CMsgDOTAMatch_Player_CustomGameData>;
export declare const CMsgDOTAMatch_Player_HeroDamageReceived: MessageFns<CMsgDOTAMatch_Player_HeroDamageReceived>;
export declare const CMsgDOTAMatch_BroadcasterInfo: MessageFns<CMsgDOTAMatch_BroadcasterInfo>;
export declare const CMsgDOTAMatch_BroadcasterChannel: MessageFns<CMsgDOTAMatch_BroadcasterChannel>;
export declare const CMsgDOTAMatch_Coach: MessageFns<CMsgDOTAMatch_Coach>;
export declare const CMsgDOTAMatch_CustomGameData: MessageFns<CMsgDOTAMatch_CustomGameData>;
export declare const CMsgPlayerCard: MessageFns<CMsgPlayerCard>;
export declare const CMsgPlayerCard_StatModifier: MessageFns<CMsgPlayerCard_StatModifier>;
export declare const CMsgDOTAFantasyPlayerStats: MessageFns<CMsgDOTAFantasyPlayerStats>;
export declare const CMsgDOTAFantasyPlayerMatchStats: MessageFns<CMsgDOTAFantasyPlayerMatchStats>;
export declare const CMsgDOTABotDebugInfo: MessageFns<CMsgDOTABotDebugInfo>;
export declare const CMsgDOTABotDebugInfo_Bot: MessageFns<CMsgDOTABotDebugInfo_Bot>;
export declare const CMsgDOTABotDebugInfo_Bot_Mode: MessageFns<CMsgDOTABotDebugInfo_Bot_Mode>;
export declare const CMsgDOTABotDebugInfo_Bot_Action: MessageFns<CMsgDOTABotDebugInfo_Bot_Action>;
export declare const CMsgSuccessfulHero: MessageFns<CMsgSuccessfulHero>;
export declare const CMsgRecentMatchInfo: MessageFns<CMsgRecentMatchInfo>;
export declare const CMsgMatchTips: MessageFns<CMsgMatchTips>;
export declare const CMsgMatchTips_SingleTip: MessageFns<CMsgMatchTips_SingleTip>;
export declare const CMsgDOTAMatchMinimal: MessageFns<CMsgDOTAMatchMinimal>;
export declare const CMsgDOTAMatchMinimal_Player: MessageFns<CMsgDOTAMatchMinimal_Player>;
export declare const CMsgDOTAMatchMinimal_Tourney: MessageFns<CMsgDOTAMatchMinimal_Tourney>;
export declare const CMsgConsumableUsage: MessageFns<CMsgConsumableUsage>;
export declare const CMsgMatchConsumableUsage: MessageFns<CMsgMatchConsumableUsage>;
export declare const CMsgMatchConsumableUsage_PlayerUsage: MessageFns<CMsgMatchConsumableUsage_PlayerUsage>;
export declare const CMsgMatchEventActionGrants: MessageFns<CMsgMatchEventActionGrants>;
export declare const CMsgMatchEventActionGrants_PlayerGrants: MessageFns<CMsgMatchEventActionGrants_PlayerGrants>;
export declare const CMsgCustomGameWhitelist: MessageFns<CMsgCustomGameWhitelist>;
export declare const CMsgCustomGameWhitelistForEdit: MessageFns<CMsgCustomGameWhitelistForEdit>;
export declare const CMsgCustomGameWhitelistForEdit_WhitelistEntry: MessageFns<CMsgCustomGameWhitelistForEdit_WhitelistEntry>;
export declare const CMsgPlayerRecentMatchInfo: MessageFns<CMsgPlayerRecentMatchInfo>;
export declare const CMsgPlayerMatchRecord: MessageFns<CMsgPlayerMatchRecord>;
export declare const CMsgPlayerRecentMatchOutcomes: MessageFns<CMsgPlayerRecentMatchOutcomes>;
export declare const CMsgPlayerRecentCommends: MessageFns<CMsgPlayerRecentCommends>;
export declare const CMsgPlayerRecentAccomplishments: MessageFns<CMsgPlayerRecentAccomplishments>;
export declare const CMsgPlayerHeroRecentAccomplishments: MessageFns<CMsgPlayerHeroRecentAccomplishments>;
export declare const CMsgRecentAccomplishments: MessageFns<CMsgRecentAccomplishments>;
export declare const CMsgServerToGCRequestPlayerRecentAccomplishments: MessageFns<CMsgServerToGCRequestPlayerRecentAccomplishments>;
export declare const CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse: MessageFns<CMsgServerToGCRequestPlayerRecentAccomplishmentsResponse>;
export declare const CMsgArcanaVoteMatchVotes: MessageFns<CMsgArcanaVoteMatchVotes>;
export declare const CMsgGCtoGCAssociatedExploiterAccountInfo: MessageFns<CMsgGCtoGCAssociatedExploiterAccountInfo>;
export declare const CMsgGCtoGCAssociatedExploiterAccountInfoResponse: MessageFns<CMsgGCtoGCAssociatedExploiterAccountInfoResponse>;
export declare const CMsgGCtoGCAssociatedExploiterAccountInfoResponse_Account: MessageFns<CMsgGCtoGCAssociatedExploiterAccountInfoResponse_Account>;
export declare const CMsgPullTabsData: MessageFns<CMsgPullTabsData>;
export declare const CMsgPullTabsData_Slot: MessageFns<CMsgPullTabsData_Slot>;
export declare const CMsgPullTabsData_Jackpot: MessageFns<CMsgPullTabsData_Jackpot>;
export declare const CMsgUnderDraftData: MessageFns<CMsgUnderDraftData>;
export declare const CMsgUnderDraftData_BenchSlot: MessageFns<CMsgUnderDraftData_BenchSlot>;
export declare const CMsgUnderDraftData_ShopSlot: MessageFns<CMsgUnderDraftData_ShopSlot>;
export declare const CMsgPlayerTitleData: MessageFns<CMsgPlayerTitleData>;
export declare const CMsgDOTATriviaQuestion: MessageFns<CMsgDOTATriviaQuestion>;
export declare const CMsgDOTATriviaQuestionAnswersSummary: MessageFns<CMsgDOTATriviaQuestionAnswersSummary>;
export declare const CMsgGameDataSpecialValueBonus: MessageFns<CMsgGameDataSpecialValueBonus>;
export declare const CMsgGameDataSpecialValues: MessageFns<CMsgGameDataSpecialValues>;
export declare const CMsgGameDataFacetAbilityBonus: MessageFns<CMsgGameDataFacetAbilityBonus>;
export declare const CMsgGameDataAbilityOrItem: MessageFns<CMsgGameDataAbilityOrItem>;
export declare const CMsgGameDataAbilityOrItemList: MessageFns<CMsgGameDataAbilityOrItemList>;
export declare const CMsgGameDataHero: MessageFns<CMsgGameDataHero>;
export declare const CMsgGameDataHero_Facet: MessageFns<CMsgGameDataHero_Facet>;
export declare const CMsgGameDataAbilities: MessageFns<CMsgGameDataAbilities>;
export declare const CMsgGameDataItems: MessageFns<CMsgGameDataItems>;
export declare const CMsgGameDataHeroes: MessageFns<CMsgGameDataHeroes>;
export declare const CMsgGameDataHeroList: MessageFns<CMsgGameDataHeroList>;
export declare const CMsgGameDataHeroList_HeroInfo: MessageFns<CMsgGameDataHeroList_HeroInfo>;
export declare const CMsgGameDataItemAbilityList: MessageFns<CMsgGameDataItemAbilityList>;
export declare const CMsgGameDataItemAbilityList_ItemAbilityInfo: MessageFns<CMsgGameDataItemAbilityList_ItemAbilityInfo>;
export declare const CMsgGameDataItemAbilityList_ItemAbilityInfo_Recipe: MessageFns<CMsgGameDataItemAbilityList_ItemAbilityInfo_Recipe>;
export declare const CMsgLobbyAbilityDraftData: MessageFns<CMsgLobbyAbilityDraftData>;
export declare const CSOEconItemDropRateBonus: MessageFns<CSOEconItemDropRateBonus>;
export declare const CSOEconItemTournamentPassport: MessageFns<CSOEconItemTournamentPassport>;
export declare const CMsgStickerbookSticker: MessageFns<CMsgStickerbookSticker>;
export declare const CMsgStickerbookPage: MessageFns<CMsgStickerbookPage>;
export declare const CMsgStickerbookTeamPageOrderSequence: MessageFns<CMsgStickerbookTeamPageOrderSequence>;
export declare const CMsgStickerbook: MessageFns<CMsgStickerbook>;
export declare const CMsgStickerHero: MessageFns<CMsgStickerHero>;
export declare const CMsgStickerHeroes: MessageFns<CMsgStickerHeroes>;
export declare const CMsgHeroRoleStats: MessageFns<CMsgHeroRoleStats>;
export declare const CMsgHeroRoleHeroStats: MessageFns<CMsgHeroRoleHeroStats>;
export declare const CMsgHeroRoleRankStats: MessageFns<CMsgHeroRoleRankStats>;
export declare const CMsgHeroRoleAllRanksStats: MessageFns<CMsgHeroRoleAllRanksStats>;
export declare const CMsgMapStatsSnapshot: MessageFns<CMsgMapStatsSnapshot>;
export declare const CMsgGlobalMapStats: MessageFns<CMsgGlobalMapStats>;
export declare const CMsgTrackedStat: MessageFns<CMsgTrackedStat>;
export declare const CMsgDOTAClaimEventActionResponse: MessageFns<CMsgDOTAClaimEventActionResponse>;
export declare const CMsgDOTAClaimEventActionResponse_MysteryItemRewardData: MessageFns<CMsgDOTAClaimEventActionResponse_MysteryItemRewardData>;
export declare const CMsgDOTAClaimEventActionResponse_LootListRewardData: MessageFns<CMsgDOTAClaimEventActionResponse_LootListRewardData>;
export declare const CMsgDOTAClaimEventActionResponse_ActionListRewardData: MessageFns<CMsgDOTAClaimEventActionResponse_ActionListRewardData>;
export declare const CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData: MessageFns<CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData>;
export declare const CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData_TokenQuantity: MessageFns<CMsgDOTAClaimEventActionResponse_OverworldTokenRewardData_TokenQuantity>;
export declare const CMsgDOTAClaimEventActionResponse_GrantedRewardData: MessageFns<CMsgDOTAClaimEventActionResponse_GrantedRewardData>;
export declare const CMsgClientToGCDotaLabsFeedback: MessageFns<CMsgClientToGCDotaLabsFeedback>;
export declare const CMsgClientToGCDotaLabsFeedbackResponse: MessageFns<CMsgClientToGCDotaLabsFeedbackResponse>;
export declare const CDotaMsgPredictionResult: MessageFns<CDotaMsgPredictionResult>;
export declare const CDotaMsgPredictionResult_Prediction: MessageFns<CDotaMsgPredictionResult_Prediction>;
type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;
type DeepPartial<T> = T extends Builtin ? T : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>> : T extends {} ? {
    [K in keyof T]?: DeepPartial<T[K]>;
} : Partial<T>;
interface MessageFns<T> {
    encode(message: T, writer?: BinaryWriter): BinaryWriter;
    decode(input: BinaryReader | Uint8Array, length?: number): T;
    fromJSON(object: any): T;
    toJSON(message: T): unknown;
    create(base?: DeepPartial<T>): T;
    fromPartial(object: DeepPartial<T>): T;
}
export {};
//# sourceMappingURL=dota_gcmessages_common.d.ts.map