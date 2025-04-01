import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CMsgPendingEventAward, DOTABotDifficulty, dotaCmPick, DOTAGameState, dotaGcTeam, DOTALeaverStatusT, DOTALobbyVisibility, DOTASelectionPriorityChoice, DOTASelectionPriorityRules, EDOTAMMRBoostType, EEvent, EMatchOutcome } from "./dota_shared_enums";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
export declare enum ELobbyMemberCoachRequestState {
    k_eLobbyMemberCoachRequestState_None = 0,
    k_eLobbyMemberCoachRequestState_Accepted = 1,
    k_eLobbyMemberCoachRequestState_Rejected = 2
}
export declare function eLobbyMemberCoachRequestStateFromJSON(object: any): ELobbyMemberCoachRequestState;
export declare function eLobbyMemberCoachRequestStateToJSON(object: ELobbyMemberCoachRequestState): string;
export declare enum LobbyDotaTVDelay {
    LobbyDotaTV_10 = 0,
    LobbyDotaTV_120 = 1,
    LobbyDotaTV_300 = 2,
    LobbyDotaTV_900 = 3
}
export declare function lobbyDotaTVDelayFromJSON(object: any): LobbyDotaTVDelay;
export declare function lobbyDotaTVDelayToJSON(object: LobbyDotaTVDelay): string;
export declare enum LobbyDotaPauseSetting {
    LobbyDotaPauseSetting_Unlimited = 0,
    LobbyDotaPauseSetting_Limited = 1,
    LobbyDotaPauseSetting_Disabled = 2
}
export declare function lobbyDotaPauseSettingFromJSON(object: any): LobbyDotaPauseSetting;
export declare function lobbyDotaPauseSettingToJSON(object: LobbyDotaPauseSetting): string;
export interface CMsgLobbyCoachFriendRequest {
    coachAccountId: number;
    playerAccountId: number;
    requestState: ELobbyMemberCoachRequestState;
}
export interface CMsgLobbyPlayerPlusSubscriptionData {
    heroBadges: CMsgLobbyPlayerPlusSubscriptionData_HeroBadge[];
}
export interface CMsgLobbyPlayerPlusSubscriptionData_HeroBadge {
    heroId: number;
    heroBadgeXp: number;
}
export interface CMsgEventActionData {
    actionId: number;
    actionScore: number;
}
export interface CMsgPeriodicResourceData {
    periodicResourceId: number;
    remaining: number;
    max: number;
}
export interface CMsgLobbyEventPoints {
    eventId: number;
    accountPoints: CMsgLobbyEventPoints_AccountPoints[];
}
export interface CMsgLobbyEventPoints_AccountPoints {
    accountId: number;
    normalPoints: number;
    premiumPoints: number;
    owned: boolean;
    eventLevel: number;
    activeEffectsMask: string;
    wagerStreak: number;
    eventGameCustomActions: CMsgEventActionData[];
    tipAmountIndex: number;
    activeEventSeasonId: number;
    teleportFxLevel: number;
    networkedEventActions: CMsgEventActionData[];
    periodicResources: CMsgPeriodicResourceData[];
    extraEventMessages: CExtraMsgBlock[];
}
export interface CMsgLobbyEventGameData {
    gameSeed: number;
    eventWindowStartTime: number;
}
export interface CSODOTALobbyInvite {
    groupId: string;
    senderId: string;
    senderName: string;
    members: CSODOTALobbyInvite_LobbyMember[];
    customGameId: string;
    inviteGid: string;
    customGameCrc: string;
    customGameTimestamp: number;
}
export interface CSODOTALobbyInvite_LobbyMember {
    name: string;
    steamId: string;
}
export interface CSODOTALobbyMember {
    id: string;
    heroId: number;
    team: dotaGcTeam;
    slot: number;
    leaverStatus: DOTALeaverStatusT;
    leaverActions: number;
    coachTeam: dotaGcTeam;
    customGameProductIds: number[];
    liveSpectatorTeam: dotaGcTeam;
    pendingAwards: CMsgPendingEventAward[];
    pendingAwardsOnVictory: CMsgPendingEventAward[];
    reportsAvailable: number;
    liveSpectatorAccountId: number;
    commsReportsAvailable: number;
}
export interface CSODOTAServerLobbyMember {
}
export interface CSODOTAStaticLobbyMember {
    name: string;
    partyId: string;
    channel: number;
    cameraman: boolean;
}
export interface CSODOTAServerStaticLobbyMember {
    steamId: string;
    rankTier: number;
    leaderboardRank: number;
    laneSelectionFlags: number;
    rankMmrBoostType: EDOTAMMRBoostType;
    coachRating: number;
    coachedAccountIds: number[];
    wasMvpLastGame: boolean;
    canEarnRewards: boolean;
    isPlusSubscriber: boolean;
    favoriteTeamPacked: string;
    isSteamChina: boolean;
    title: number;
    guildId: number;
    disabledRandomHeroBits: number[];
    disabledHeroId: number[];
    enabledHeroId: number[];
    bannedHeroIds: number[];
}
export interface CLobbyTeamDetails {
    teamName: string;
    teamTag: string;
    teamId: number;
    teamLogo: string;
    teamBaseLogo: string;
    teamBannerLogo: string;
    teamComplete: boolean;
    rank: number;
    rankChange: number;
    isHomeTeam: boolean;
    isChallengeMatch: boolean;
    challengeMatchTokenAccount: string;
    teamLogoUrl: string;
    teamAbbreviation: string;
}
export interface CLobbyGuildDetails {
    guildId: number;
    guildPrimaryColor: number;
    guildSecondaryColor: number;
    guildPattern: number;
    guildLogo: string;
    guildPoints: number;
    guildEvent: number;
    guildFlags: number;
    teamForGuild: dotaGcTeam;
    guildTag: string;
    guildWeeklyPercentile: number;
}
export interface CLobbyTimedRewardDetails {
    itemDefIndex: number;
    isSupplyCrate: boolean;
    isTimedDrop: boolean;
    accountId: number;
    origin: number;
}
export interface CLobbyBroadcastChannelInfo {
    channelId: number;
    countryCode: string;
    description: string;
    languageCode: string;
}
export interface CLobbyGuildChallenge {
    guildId: number;
    eventId: EEvent;
    challengeInstanceId: number;
    challengeParameter: number;
    challengeTimestamp: number;
    challengePeriodSerial: number;
    challengeProgressAtStart: number;
    eligibleAccountIds: number[];
}
export interface CDOTALobbyMatchQualityData {
    overallQuality: number;
    teamBalance: number;
    matchSkillRange: number;
    matchBehavior: number;
}
export interface CSODOTALobby {
    lobbyId: string;
    allMembers: CSODOTALobbyMember[];
    memberIndices: number[];
    leftMemberIndices: number[];
    freeMemberIndices: number[];
    leaderId: string;
    serverId: string;
    gameMode: number;
    pendingInvites: string[];
    state: CSODOTALobby_State;
    connect: string;
    lobbyType: CSODOTALobby_LobbyType;
    allowCheats: boolean;
    fillWithBots: boolean;
    gameName: string;
    teamDetails: CLobbyTeamDetails[];
    tournamentId: number;
    tournamentGameId: number;
    serverRegion: number;
    gameState: DOTAGameState;
    numSpectators: number;
    matchgroup: number;
    cmPick: dotaCmPick;
    matchId: string;
    allowSpectating: boolean;
    botDifficultyRadiant: DOTABotDifficulty;
    passKey: string;
    leagueid: number;
    penaltyLevelRadiant: number;
    penaltyLevelDire: number;
    seriesType: number;
    radiantSeriesWins: number;
    direSeriesWins: number;
    allchat: boolean;
    dotaTvDelay: LobbyDotaTVDelay;
    customGameMode: string;
    customMapName: string;
    customDifficulty: number;
    lan: boolean;
    broadcastChannelInfo: CLobbyBroadcastChannelInfo[];
    firstLeaverAccountid: number;
    seriesId: number;
    lowPriority: boolean;
    extraMessages: CSODOTALobby_CExtraMsg[];
    firstBloodHappened: boolean;
    matchOutcome: EMatchOutcome;
    massDisconnect: boolean;
    customGameId: string;
    customMinPlayers: number;
    customMaxPlayers: number;
    visibility: DOTALobbyVisibility;
    customGameCrc: string;
    customGameAutoCreatedLobby: boolean;
    customGameTimestamp: number;
    previousSeriesMatches: string[];
    previousMatchOverride: string;
    gameStartTime: number;
    pauseSetting: LobbyDotaPauseSetting;
    weekendTourneyDivisionId: number;
    weekendTourneySkillLevel: number;
    weekendTourneyBracketRound: number;
    botDifficultyDire: DOTABotDifficulty;
    botRadiant: string;
    botDire: string;
    eventProgressionEnabled: EEvent[];
    selectionPriorityRules: DOTASelectionPriorityRules;
    seriesPreviousSelectionPriorityTeamId: number;
    seriesCurrentSelectionPriorityTeamId: number;
    seriesCurrentPriorityTeamChoice: DOTASelectionPriorityChoice;
    seriesCurrentNonPriorityTeamChoice: DOTASelectionPriorityChoice;
    seriesCurrentSelectionPriorityUsedCoinToss: boolean;
    currentPrimaryEvent: EEvent;
    emergencyDisabledHeroIds: number[];
    customGamePrivateKey: string;
    customGamePenalties: boolean;
    lanHostPingLocation: string;
    leagueNodeId: number;
    matchDuration: number;
    leaguePhase: number;
    experimentalGameplayEnabled: boolean;
    guildChallenges: CLobbyGuildChallenge[];
    guildDetails: CLobbyGuildDetails[];
    requestedHeroIds: number[];
    coachFriendRequests: CMsgLobbyCoachFriendRequest[];
    isInSteamChina: boolean;
    withScenarioSave: boolean;
    lobbyCreationTime: number;
    eventGameDefinition: string;
    matchQualityData: CDOTALobbyMatchQualityData | undefined;
}
export declare enum CSODOTALobby_State {
    UI = 0,
    READYUP = 4,
    SERVERSETUP = 1,
    RUN = 2,
    POSTGAME = 3,
    NOTREADY = 5,
    SERVERASSIGN = 6
}
export declare function cSODOTALobby_StateFromJSON(object: any): CSODOTALobby_State;
export declare function cSODOTALobby_StateToJSON(object: CSODOTALobby_State): string;
export declare enum CSODOTALobby_LobbyType {
    INVALID = -1,
    CASUAL_MATCH = 0,
    PRACTICE = 1,
    COOP_BOT_MATCH = 4,
    COMPETITIVE_MATCH = 7,
    WEEKEND_TOURNEY = 9,
    LOCAL_BOT_MATCH = 10,
    SPECTATOR = 11,
    EVENT_MATCH = 12,
    NEW_PLAYER_POOL = 14,
    FEATURED_GAMEMODE = 15
}
export declare function cSODOTALobby_LobbyTypeFromJSON(object: any): CSODOTALobby_LobbyType;
export declare function cSODOTALobby_LobbyTypeToJSON(object: CSODOTALobby_LobbyType): string;
export interface CSODOTALobby_CExtraMsg {
    id: number;
    contents: Buffer;
}
export interface CSODOTAServerLobby {
    allMembers: CSODOTAServerLobbyMember[];
    extraStartupMessages: CSODOTALobby_CExtraMsg[];
}
export interface CSODOTAStaticLobby {
    allMembers: CSODOTAStaticLobbyMember[];
    isPlayerDraft: boolean;
    isLastMatchInSeries: boolean;
}
export interface CSODOTAServerStaticLobby {
    allMembers: CSODOTAServerStaticLobbyMember[];
    postPatchStrategyTimeBuffer: number;
    lobbyEventPoints: CMsgLobbyEventPoints[];
}
export interface CMsgAdditionalLobbyStartupAccountData {
    accountId: number;
    plusData: CMsgLobbyPlayerPlusSubscriptionData | undefined;
    unlockedChatWheelMessageRanges: CMsgAdditionalLobbyStartupAccountData_ChatWheelMessageRange[];
    unlockedPingWheelMessageRanges: CMsgAdditionalLobbyStartupAccountData_PingWheelMessageRange[];
}
export interface CMsgAdditionalLobbyStartupAccountData_ChatWheelMessageRange {
    messageIdStart: number;
    messageIdEnd: number;
}
export interface CMsgAdditionalLobbyStartupAccountData_PingWheelMessageRange {
    messageIdStart: number;
    messageIdEnd: number;
}
export interface CMsgLobbyInitializationComplete {
}
export interface CMsgLobbyPlaytestDetails {
    json: string;
}
export interface CMsgLocalServerGuildData {
    guildId: number;
    eventId: EEvent;
    guildPoints: number;
    guildLogo: string;
    guildPrimaryColor: number;
    guildSecondaryColor: number;
    guildPattern: number;
    guildFlags: number;
    guildWeeklyPercentile: number;
}
export interface CMsgLocalServerFakeLobbyData {
    accountId: number;
    eventPoints: CMsgLobbyEventPoints[];
    isPlusSubscriber: boolean;
    primaryEventId: number;
    favoriteTeam: number;
    favoriteTeamQuality: number;
    guildInfo: CMsgLocalServerGuildData | undefined;
    teleportFxLevel: number;
    additionalData: CMsgAdditionalLobbyStartupAccountData | undefined;
}
export declare const CMsgLobbyCoachFriendRequest: MessageFns<CMsgLobbyCoachFriendRequest>;
export declare const CMsgLobbyPlayerPlusSubscriptionData: MessageFns<CMsgLobbyPlayerPlusSubscriptionData>;
export declare const CMsgLobbyPlayerPlusSubscriptionData_HeroBadge: MessageFns<CMsgLobbyPlayerPlusSubscriptionData_HeroBadge>;
export declare const CMsgEventActionData: MessageFns<CMsgEventActionData>;
export declare const CMsgPeriodicResourceData: MessageFns<CMsgPeriodicResourceData>;
export declare const CMsgLobbyEventPoints: MessageFns<CMsgLobbyEventPoints>;
export declare const CMsgLobbyEventPoints_AccountPoints: MessageFns<CMsgLobbyEventPoints_AccountPoints>;
export declare const CMsgLobbyEventGameData: MessageFns<CMsgLobbyEventGameData>;
export declare const CSODOTALobbyInvite: MessageFns<CSODOTALobbyInvite>;
export declare const CSODOTALobbyInvite_LobbyMember: MessageFns<CSODOTALobbyInvite_LobbyMember>;
export declare const CSODOTALobbyMember: MessageFns<CSODOTALobbyMember>;
export declare const CSODOTAServerLobbyMember: MessageFns<CSODOTAServerLobbyMember>;
export declare const CSODOTAStaticLobbyMember: MessageFns<CSODOTAStaticLobbyMember>;
export declare const CSODOTAServerStaticLobbyMember: MessageFns<CSODOTAServerStaticLobbyMember>;
export declare const CLobbyTeamDetails: MessageFns<CLobbyTeamDetails>;
export declare const CLobbyGuildDetails: MessageFns<CLobbyGuildDetails>;
export declare const CLobbyTimedRewardDetails: MessageFns<CLobbyTimedRewardDetails>;
export declare const CLobbyBroadcastChannelInfo: MessageFns<CLobbyBroadcastChannelInfo>;
export declare const CLobbyGuildChallenge: MessageFns<CLobbyGuildChallenge>;
export declare const CDOTALobbyMatchQualityData: MessageFns<CDOTALobbyMatchQualityData>;
export declare const CSODOTALobby: MessageFns<CSODOTALobby>;
export declare const CSODOTALobby_CExtraMsg: MessageFns<CSODOTALobby_CExtraMsg>;
export declare const CSODOTAServerLobby: MessageFns<CSODOTAServerLobby>;
export declare const CSODOTAStaticLobby: MessageFns<CSODOTAStaticLobby>;
export declare const CSODOTAServerStaticLobby: MessageFns<CSODOTAServerStaticLobby>;
export declare const CMsgAdditionalLobbyStartupAccountData: MessageFns<CMsgAdditionalLobbyStartupAccountData>;
export declare const CMsgAdditionalLobbyStartupAccountData_ChatWheelMessageRange: MessageFns<CMsgAdditionalLobbyStartupAccountData_ChatWheelMessageRange>;
export declare const CMsgAdditionalLobbyStartupAccountData_PingWheelMessageRange: MessageFns<CMsgAdditionalLobbyStartupAccountData_PingWheelMessageRange>;
export declare const CMsgLobbyInitializationComplete: MessageFns<CMsgLobbyInitializationComplete>;
export declare const CMsgLobbyPlaytestDetails: MessageFns<CMsgLobbyPlaytestDetails>;
export declare const CMsgLocalServerGuildData: MessageFns<CMsgLocalServerGuildData>;
export declare const CMsgLocalServerFakeLobbyData: MessageFns<CMsgLocalServerFakeLobbyData>;
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
//# sourceMappingURL=dota_gcmessages_common_lobby.d.ts.map