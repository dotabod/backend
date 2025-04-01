import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CSOEconItem } from "./base_gcmessages";
import { CMatchClip, CMsgArcanaVoteMatchVotes, CMsgDOTAClaimEventActionResponse, CMsgDOTAMatch, CMsgDOTASDOHeroStatsHistory, CMsgDOTATriviaQuestion, CMsgGlobalMapStats, CMsgMapStatsSnapshot, CMsgPlayerHeroRecentAccomplishments, CMsgPlayerRecentAccomplishments, CMsgRecentMatchInfo, CMsgStickerbook, CMsgStickerbookPage, CMsgStickerbookSticker, CMsgStickerbookTeamPageOrderSequence, CMsgStickerHeroes, CMsgSuccessfulHero, CMsgUnderDraftData, CPartySearchClientParty, EHeroRelicRarity, ENewBloomGiftingResponse, EOverwatchConviction, EStickerbookPageType } from "./dota_gcmessages_common";
import { CSODOTALobby_State } from "./dota_gcmessages_common_lobby";
import { CSODOTAParty_State } from "./dota_gcmessages_common_match_management";
import { DOTAGameMode, DOTAMatchVote, DOTASelectionPriorityChoice, EDPCFavoriteType, EEvent, EEventActionScoreMode, ELeagueRegion, EMatchGroupServerStatus, EOverwatchReportReason, EProfileCardSlotType, ERankType, MatchType } from "./dota_shared_enums";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
export declare enum CMsgDOTARequestMatchesSkillLevel {
    CMsgDOTARequestMatches_SkillLevel_Any = 0,
    CMsgDOTARequestMatches_SkillLevel_Normal = 1,
    CMsgDOTARequestMatches_SkillLevel_High = 2,
    CMsgDOTARequestMatches_SkillLevel_VeryHigh = 3
}
export declare function cMsgDOTARequestMatchesSkillLevelFromJSON(object: any): CMsgDOTARequestMatchesSkillLevel;
export declare function cMsgDOTARequestMatchesSkillLevelToJSON(object: CMsgDOTARequestMatchesSkillLevel): string;
export declare enum DOTAWatchReplayType {
    DOTA_WATCH_REPLAY_NORMAL = 0,
    DOTA_WATCH_REPLAY_HIGHLIGHTS = 1
}
export declare function dOTAWatchReplayTypeFromJSON(object: any): DOTAWatchReplayType;
export declare function dOTAWatchReplayTypeToJSON(object: DOTAWatchReplayType): string;
export declare enum EItemEditorReservationResult {
    k_EItemEditorReservationResult_OK = 1,
    k_EItemEditorReservationResult_AlreadyExists = 2,
    k_EItemEditorReservationResult_Reserved = 3,
    k_EItemEditorReservationResult_TimedOut = 4
}
export declare function eItemEditorReservationResultFromJSON(object: any): EItemEditorReservationResult;
export declare function eItemEditorReservationResultToJSON(object: EItemEditorReservationResult): string;
export declare enum EWeekendTourneyRichPresenceEvent {
    k_EWeekendTourneyRichPresenceEvent_None = 0,
    k_EWeekendTourneyRichPresenceEvent_StartedMatch = 1,
    k_EWeekendTourneyRichPresenceEvent_WonMatch = 2,
    k_EWeekendTourneyRichPresenceEvent_Eliminated = 3
}
export declare function eWeekendTourneyRichPresenceEventFromJSON(object: any): EWeekendTourneyRichPresenceEvent;
export declare function eWeekendTourneyRichPresenceEventToJSON(object: EWeekendTourneyRichPresenceEvent): string;
export declare enum EDOTATriviaAnswerResult {
    k_EDOTATriviaAnswerResult_Success = 0,
    k_EDOTATriviaAnswerResult_InvalidQuestion = 1,
    k_EDOTATriviaAnswerResult_InvalidAnswer = 2,
    k_EDOTATriviaAnswerResult_QuestionLocked = 3,
    k_EDOTATriviaAnswerResult_AlreadyAnswered = 4,
    k_EDOTATriviaAnswerResult_TriviaDisabled = 5
}
export declare function eDOTATriviaAnswerResultFromJSON(object: any): EDOTATriviaAnswerResult;
export declare function eDOTATriviaAnswerResultToJSON(object: EDOTATriviaAnswerResult): string;
export declare enum EPurchaseHeroRelicResult {
    k_EPurchaseHeroRelicResult_Success = 0,
    k_EPurchaseHeroRelicResult_FailedToSend = 1,
    k_EPurchaseHeroRelicResult_NotEnoughPoints = 2,
    k_EPurchaseHeroRelicResult_InternalServerError = 3,
    k_EPurchaseHeroRelicResult_PurchaseNotAllowed = 4,
    k_EPurchaseHeroRelicResult_InvalidRelic = 5,
    k_EPurchaseHeroRelicResult_AlreadyOwned = 6,
    k_EPurchaseHeroRelicResult_InvalidRarity = 7
}
export declare function ePurchaseHeroRelicResultFromJSON(object: any): EPurchaseHeroRelicResult;
export declare function ePurchaseHeroRelicResultToJSON(object: EPurchaseHeroRelicResult): string;
export declare enum EDevEventRequestResult {
    k_EDevEventRequestResult_Success = 0,
    k_EDevEventRequestResult_NotAllowed = 1,
    k_EDevEventRequestResult_InvalidEvent = 2,
    k_EDevEventRequestResult_SqlFailure = 3,
    k_EDevEventRequestResult_Timeout = 4,
    k_EDevEventRequestResult_LockFailure = 5,
    k_EDevEventRequestResult_SDOLoadFailure = 6
}
export declare function eDevEventRequestResultFromJSON(object: any): EDevEventRequestResult;
export declare function eDevEventRequestResultToJSON(object: EDevEventRequestResult): string;
export declare enum ESupportEventRequestResult {
    k_ESupportEventRequestResult_Success = 0,
    k_ESupportEventRequestResult_Timeout = 1,
    k_ESupportEventRequestResult_CantLockSOCache = 2,
    k_ESupportEventRequestResult_ItemNotInInventory = 3,
    k_ESupportEventRequestResult_InvalidItemDef = 4,
    k_ESupportEventRequestResult_InvalidEvent = 5,
    k_ESupportEventRequestResult_EventExpired = 6,
    k_ESupportEventRequestResult_InvalidSupportAccount = 7,
    k_ESupportEventRequestResult_InvalidSupportMessage = 8,
    k_ESupportEventRequestResult_InvalidEventPoints = 9,
    k_ESupportEventRequestResult_InvalidPremiumPoints = 10,
    k_ESupportEventRequestResult_InvalidActionID = 11,
    k_ESupportEventRequestResult_InvalidActionScore = 12,
    k_ESupportEventRequestResult_TransactionFailed = 13
}
export declare function eSupportEventRequestResultFromJSON(object: any): ESupportEventRequestResult;
export declare function eSupportEventRequestResultToJSON(object: ESupportEventRequestResult): string;
export declare enum EUnderDraftResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eNoGold = 2,
    k_eInvalidSlot = 3,
    k_eNoBenchSpace = 4,
    k_eNoTickets = 5,
    k_eEventNotOwned = 6,
    k_eInvalidReward = 7,
    k_eHasBigReward = 8,
    k_eNoGCConnection = 9,
    k_eTooBusy = 10,
    k_eCantRollBack = 11
}
export declare function eUnderDraftResponseFromJSON(object: any): EUnderDraftResponse;
export declare function eUnderDraftResponseToJSON(object: EUnderDraftResponse): string;
export declare enum EDOTADraftTriviaAnswerResult {
    k_EDOTADraftTriviaAnswerResult_Success = 0,
    k_EDOTADraftTriviaAnswerResult_InvalidMatchID = 1,
    k_EDOTADraftTriviaAnswerResult_AlreadyAnswered = 2,
    k_EDOTADraftTriviaAnswerResult_InternalError = 3,
    k_EDOTADraftTriviaAnswerResult_TriviaDisabled = 4,
    k_EDOTADraftTriviaAnswerResult_GCDown = 5
}
export declare function eDOTADraftTriviaAnswerResultFromJSON(object: any): EDOTADraftTriviaAnswerResult;
export declare function eDOTADraftTriviaAnswerResultToJSON(object: EDOTADraftTriviaAnswerResult): string;
export declare enum CMsgClientToGCUpdateComicBookStatType {
    CMsgClientToGCUpdateComicBookStat_Type_HighestPageRead = 1,
    CMsgClientToGCUpdateComicBookStat_Type_SecondsSpentReading = 2,
    CMsgClientToGCUpdateComicBookStat_Type_HighestPercentRead = 3
}
export declare function cMsgClientToGCUpdateComicBookStatTypeFromJSON(object: any): CMsgClientToGCUpdateComicBookStatType;
export declare function cMsgClientToGCUpdateComicBookStatTypeToJSON(object: CMsgClientToGCUpdateComicBookStatType): string;
export interface CMsgClientSuspended {
    timeEnd: number;
}
export interface CMsgBalancedShuffleLobby {
}
export interface CMsgInitialQuestionnaireResponse {
    initialSkill: number;
}
export interface CMsgDOTARequestMatchesResponse {
    matches: CMsgDOTAMatch[];
    series: CMsgDOTARequestMatchesResponse_Series[];
    requestId: number;
    totalResults: number;
    resultsRemaining: number;
}
export interface CMsgDOTARequestMatchesResponse_Series {
    matches: CMsgDOTAMatch[];
    seriesId: number;
    seriesType: number;
}
export interface CMsgDOTAPopup {
    id: CMsgDOTAPopup_PopupID;
    customText: string;
    intData: number;
    popupData: Buffer;
    locTokenHeader: string;
    locTokenMsg: string;
    varNames: string[];
    varValues: string[];
    debugText: string;
}
export declare enum CMsgDOTAPopup_PopupID {
    NONE = -1,
    KICKED_FROM_LOBBY = 0,
    KICKED_FROM_PARTY = 1,
    KICKED_FROM_TEAM = 2,
    TEAM_WAS_DISBANDED = 3,
    TEAM_MATCHMAKE_ALREADY_MATCH = 4,
    TEAM_MATCHMAKE_ALREADY_FINDING = 5,
    TEAM_MATCHMAKE_FULL = 6,
    TEAM_MATCHMAKE_FAIL_ADD = 7,
    TEAM_MATCHMAKE_FAIL_ADD_CURRENT = 8,
    TEAM_MATCHMAKE_FAILED_TEAM_MEMBER = 9,
    TEAM_MATCHMAKE_ALREADY_GAME = 10,
    TEAM_MATCHMAKE_FAIL_GET_PARTY = 11,
    MATCHMAKING_DISABLED = 12,
    INVITE_DENIED = 13,
    PARTY_FULL = 14,
    MADE_ADMIN = 15,
    NEED_TO_PURCHASE = 16,
    SIGNON_MESSAGE = 17,
    MATCHMAKING_REGION_OFFLINE = 19,
    TOURNAMENT_GAME_NOT_FOUND = 21,
    TOURNAMENT_GAME_HAS_LOBBY_ID = 22,
    TOURNAMENT_GAME_HAS_MATCH_ID = 23,
    TOURNAMENT_GAME_HAS_NO_RADIANT_TEAM = 24,
    TOURNAMENT_GAME_HAS_NO_DIRE_TEAM = 25,
    TOURNAMENT_GAME_SQL_UPDATE_FAILED = 26,
    NOT_LEAGUE_ADMIN = 27,
    IN_ANOTHER_GAME = 29,
    PARTY_MEMBER_IN_ANOTHER_GAME = 30,
    PARTY_MEMBER_IN_LOW_PRIORITY = 31,
    CLIENT_OUT_OF_DATE = 32,
    SAVE_GAME_CORRUPT = 38,
    INSUFFICIENT_INGOTS = 39,
    COMPETITIVE_MM_NOT_ENOUGH_PLAY_TIME_PLAY_MORE_CASUAL = 42,
    PARTY_LEADER_JOINED_LOBBY = 44,
    WEEKEND_TOURNEY_UNMATCHED = 48,
    POST_MATCH_SURVEY = 49,
    TROPHY_AWARDED = 50,
    TROPHY_LEVEL_UP = 51,
    ALL_HERO_CHALLENGE_PROGRESS = 52,
    NEED_INITIAL_SKILL = 53,
    NEED_INITIAL_SKILL_IN_PARTY = 54,
    TARGET_ENGINE_MISMATCH = 55,
    VAC_NOT_VERIFIED = 56,
    KICKED_FROM_QUEUE_EVENT_STARTING = 57,
    KICKED_FROM_QUEUE_EVENT_ENDING = 58,
    LOBBY_FULL = 62,
    EVENT_POINTS_EARNED = 63,
    CUSTOM_GAME_INCORRECT_VERSION = 64,
    LIMITED_USER_CHAT = 66,
    EVENT_PREMIUM_POINTS_EARNED = 67,
    LOBBY_MVP_AWARDED = 68,
    LOW_BADGE_LEVEL_CHAT = 71,
    LOW_WINS_CHAT = 72,
    UNVERIFIED_USER_CHAT = 73,
    PARTY_STARTED_FINDING_EVENT_MATCH = 74,
    GENERIC_INFO = 69,
    GENERIC_ERROR = 70,
    RANK_TIER_UPDATED = 75,
    CUSTOM_GAME_COOLDOWN_RESTRICTED = 76,
    CREATE_LOBBY_FAILED_TOO_MUCH_PLAYTIME = 77,
    CUSTOM_GAME_TOO_FEW_GAMES = 78,
    COMM_SCORE_TOO_LOW = 79
}
export declare function cMsgDOTAPopup_PopupIDFromJSON(object: any): CMsgDOTAPopup_PopupID;
export declare function cMsgDOTAPopup_PopupIDToJSON(object: CMsgDOTAPopup_PopupID): string;
export interface CMsgDOTAReportsRemainingRequest {
}
export interface CMsgDOTAReportsRemainingResponse {
    numPositiveReportsRemaining: number;
    numNegativeReportsRemaining: number;
    numPositiveReportsTotal: number;
    numNegativeReportsTotal: number;
    numCommsReportsRemaining: number;
    numCommsReportsTotal: number;
}
export interface CMsgDOTASubmitPlayerReport {
    targetAccountId: number;
    reportFlags: number;
    lobbyId: string;
    comment: string;
}
export interface CMsgDOTASubmitPlayerReportResponse {
    targetAccountId: number;
    reportFlags: number;
    debugMessage: string;
    enumResult: CMsgDOTASubmitPlayerReportResponse_EResult;
}
export declare enum CMsgDOTASubmitPlayerReportResponse_EResult {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eDuplicateReport = 2,
    k_eMixedReportFlags = 3,
    k_eTooLate = 4,
    k_eInvalidPregameReport = 5,
    k_eHasntChatted = 6,
    k_eInvalid = 7,
    k_eOwnership = 8,
    k_eMissingRequirements = 9,
    k_eInvalidRoleReport = 10,
    k_eInvalidCoachReport = 11,
    k_eNoRemainingReports = 12,
    k_eInvalidMember = 13
}
export declare function cMsgDOTASubmitPlayerReportResponse_EResultFromJSON(object: any): CMsgDOTASubmitPlayerReportResponse_EResult;
export declare function cMsgDOTASubmitPlayerReportResponse_EResultToJSON(object: CMsgDOTASubmitPlayerReportResponse_EResult): string;
export interface CMsgDOTASubmitPlayerAvoidRequest {
    targetAccountId: number;
    lobbyId: string;
    userNote: string;
}
export interface CMsgDOTASubmitPlayerAvoidRequestResponse {
    targetAccountId: number;
    result: number;
    debugMessage: string;
}
export interface CMsgDOTASubmitPlayerReportV2 {
    targetAccountId: number;
    reportReason: number[];
    lobbyId: string;
    gameTime: number;
    debugSlot: number;
    debugMatchId: string;
}
export interface CMsgDOTASubmitPlayerReportResponseV2 {
    targetAccountId: number;
    reportReason: number[];
    debugMessage: string;
    enumResult: CMsgDOTASubmitPlayerReportResponseV2_EResult;
}
export declare enum CMsgDOTASubmitPlayerReportResponseV2_EResult {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eDuplicateReport = 2,
    k_eMixedReportFlags = 3,
    k_eTooLate = 4,
    k_eInvalidPregameReport = 5,
    k_eHasntChatted = 6,
    k_eInvalid = 7,
    k_eOwnership = 8,
    k_eMissingRequirements = 9,
    k_eInvalidRoleReport = 10,
    k_eInvalidCoachReport = 11,
    k_eNoRemainingReports = 12,
    k_eInvalidMember = 13,
    k_eCannotReportPartyMember = 14
}
export declare function cMsgDOTASubmitPlayerReportResponseV2_EResultFromJSON(object: any): CMsgDOTASubmitPlayerReportResponseV2_EResult;
export declare function cMsgDOTASubmitPlayerReportResponseV2_EResultToJSON(object: CMsgDOTASubmitPlayerReportResponseV2_EResult): string;
export interface CMsgDOTASubmitLobbyMVPVote {
    targetAccountId: number;
}
export interface CMsgDOTASubmitLobbyMVPVoteResponse {
    targetAccountId: number;
    eresult: number;
}
export interface CMsgDOTALobbyMVPAwarded {
    matchId: string;
    mvpAccountId: number[];
}
export interface CMsgDOTAKickedFromMatchmakingQueue {
    matchType: MatchType;
}
export interface CMsgGCMatchDetailsRequest {
    matchId: string;
}
export interface CMsgGCMatchDetailsResponse {
    result: number;
    match: CMsgDOTAMatch | undefined;
    vote: DOTAMatchVote;
}
export interface CMsgDOTAProfileTickets {
    result: number;
    accountId: number;
    leaguePasses: CMsgDOTAProfileTickets_LeaguePass[];
}
export interface CMsgDOTAProfileTickets_LeaguePass {
    leagueId: number;
    itemDef: number;
}
export interface CMsgClientToGCGetProfileTickets {
    accountId: number;
}
export interface CMsgGCToClientPartySearchInvites {
    invites: CMsgGCToClientPartySearchInvite[];
}
export interface CMsgDOTAWelcome {
    storeItemHash: number;
    timeplayedconsecutively: number;
    allow3rdPartyMatchHistory: boolean;
    lastIpAddress: number;
    profilePrivate: boolean;
    currency: number;
    shouldRequestPlayerOrigin: boolean;
    gcSocacheFileVersion: number;
    isPerfectWorldTestAccount: boolean;
    extraMessages: CMsgDOTAWelcome_CExtraMsg[];
    minimumRecentItemId: string;
    activeEvent: EEvent;
    additionalUserMessage: number;
    customGameWhitelistVersion: number;
    partySearchFriendInvites: CMsgGCToClientPartySearchInvites | undefined;
    remainingPlaytime: number;
    disableGuildPersonaInfo: boolean;
    extraMessageBlocks: CExtraMsgBlock[];
}
export interface CMsgDOTAWelcome_CExtraMsg {
    id: number;
    contents: Buffer;
}
export interface CSODOTAGameHeroFavorites {
    accountId: number;
    heroId: number;
}
export interface CMsgDOTAMatchVotes {
    matchId: string;
    votes: CMsgDOTAMatchVotes_PlayerVote[];
}
export interface CMsgDOTAMatchVotes_PlayerVote {
    accountId: number;
    vote: number;
}
export interface CMsgMatchmakingMatchGroupInfo {
    playersSearching: number;
    autoRegionSelectPingPenalty: number;
    autoRegionSelectPingPenaltyCustom: number;
    status: EMatchGroupServerStatus;
}
export interface CMsgDOTAMatchmakingStatsRequest {
}
export interface CMsgDOTAMatchmakingStatsResponse {
    matchgroupsVersion: number;
    legacySearchingPlayersByGroupSource2: number[];
    matchGroups: CMsgMatchmakingMatchGroupInfo[];
}
export interface CMsgDOTAUpdateMatchmakingStats {
    stats: CMsgDOTAMatchmakingStatsResponse | undefined;
}
export interface CMsgDOTAUpdateMatchManagementStats {
    stats: CMsgDOTAMatchmakingStatsResponse | undefined;
}
export interface CMsgDOTASetMatchHistoryAccess {
    allow3rdPartyMatchHistory: boolean;
}
export interface CMsgDOTASetMatchHistoryAccessResponse {
    eresult: number;
}
export interface CMsgDOTANotifyAccountFlagsChange {
    accountid: number;
    accountFlags: number;
}
export interface CMsgDOTASetProfilePrivacy {
    profilePrivate: boolean;
}
export interface CMsgDOTASetProfilePrivacyResponse {
    eresult: number;
}
export interface CMsgUpgradeLeagueItem {
    matchId: string;
    leagueId: number;
}
export interface CMsgUpgradeLeagueItemResponse {
}
export interface CMsgGCWatchDownloadedReplay {
    matchId: string;
    watchType: DOTAWatchReplayType;
}
export interface CMsgClientsRejoinChatChannels {
}
export interface CMsgGCGetHeroStandings {
}
export interface CMsgGCGetHeroStandingsResponse {
    standings: CMsgGCGetHeroStandingsResponse_Hero[];
}
export interface CMsgGCGetHeroStandingsResponse_Hero {
    heroId: number;
    wins: number;
    losses: number;
    winStreak: number;
    bestWinStreak: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgGpm: number;
    avgXpm: number;
    bestKills: number;
    bestAssists: number;
    bestGpm: number;
    bestXpm: number;
    performance: number;
    winsWithAlly: number;
    lossesWithAlly: number;
    winsAgainstEnemy: number;
    lossesAgainstEnemy: number;
    networthPeak: number;
    lasthitPeak: number;
    denyPeak: number;
    damagePeak: number;
    longestGamePeak: number;
    healingPeak: number;
    avgLasthits: number;
    avgDenies: number;
}
export interface CMatchPlayerTimedStatAverages {
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    lastHits: number;
    denies: number;
    itemValue: number;
    supportGoldSpent: number;
    campsStacked: number;
    wardsPlaced: number;
    dewards: number;
    tripleKills: number;
    rampages: number;
}
export interface CMatchPlayerTimedStatStdDeviations {
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    lastHits: number;
    denies: number;
    itemValue: number;
    supportGoldSpent: number;
    campsStacked: number;
    wardsPlaced: number;
    dewards: number;
    tripleKills: number;
    rampages: number;
}
export interface CMsgGCGetHeroTimedStatsResponse {
    heroId: number;
    rankChunkedStats: CMsgGCGetHeroTimedStatsResponse_RankChunkedStats[];
}
export interface CMsgGCGetHeroTimedStatsResponse_TimedStatsContainer {
    time: number;
    allStats: CMatchPlayerTimedStatAverages | undefined;
    winningStats: CMatchPlayerTimedStatAverages | undefined;
    losingStats: CMatchPlayerTimedStatAverages | undefined;
    winningStddevs: CMatchPlayerTimedStatStdDeviations | undefined;
    losingStddevs: CMatchPlayerTimedStatStdDeviations | undefined;
}
export interface CMsgGCGetHeroTimedStatsResponse_RankChunkedStats {
    rankChunk: number;
    timedStats: CMsgGCGetHeroTimedStatsResponse_TimedStatsContainer[];
}
export interface CMsgGCItemEditorReservationsRequest {
}
export interface CMsgGCItemEditorReservation {
    defIndex: number;
    name: string;
}
export interface CMsgGCItemEditorReservationsResponse {
    reservations: CMsgGCItemEditorReservation[];
}
export interface CMsgGCItemEditorReserveItemDef {
    defIndex: number;
    username: string;
}
export interface CMsgGCItemEditorReserveItemDefResponse {
    defIndex: number;
    username: string;
    result: number;
}
export interface CMsgGCItemEditorReleaseReservation {
    defIndex: number;
    username: string;
}
export interface CMsgGCItemEditorReleaseReservationResponse {
    defIndex: number;
    released: boolean;
}
export interface CMsgFlipLobbyTeams {
}
export interface CMsgGCLobbyUpdateBroadcastChannelInfo {
    channelId: number;
    countryCode: string;
    description: string;
    languageCode: string;
}
export interface CMsgDOTAClaimEventActionData {
    grantItemGiftData: CMsgDOTAClaimEventActionData_GrantItemGiftData | undefined;
}
export interface CMsgDOTAClaimEventActionData_GrantItemGiftData {
    giveToAccountId: number;
    giftMessage: string;
}
export interface CMsgDOTAClaimEventAction {
    eventId: number;
    actionId: number;
    quantity: number;
    data: CMsgDOTAClaimEventActionData | undefined;
    scoreMode: EEventActionScoreMode;
}
export interface CMsgClientToGCClaimEventActionUsingItem {
    eventId: number;
    actionId: number;
    itemId: string;
    quantity: number;
}
export interface CMsgClientToGCClaimEventActionUsingItemResponse {
    actionResults: CMsgDOTAClaimEventActionResponse | undefined;
}
export interface CMsgGCToClientClaimEventActionUsingItemCompleted {
    itemId: string;
    actionResults: CMsgDOTAClaimEventActionResponse | undefined;
}
export interface CMsgDOTAGetEventPoints {
    eventId: number;
    accountId: number;
}
export interface CMsgDOTAGetEventPointsResponse {
    totalPoints: number;
    totalPremiumPoints: number;
    eventId: number;
    points: number;
    premiumPoints: number;
    completedActions: CMsgDOTAGetEventPointsResponse_Action[];
    accountId: number;
    owned: boolean;
    auditAction: number;
    activeSeasonId: number;
}
export interface CMsgDOTAGetEventPointsResponse_Action {
    actionId: number;
    timesCompleted: number;
}
export interface CMsgDOTAGetPeriodicResource {
    accountId: number;
    periodicResourceId: number;
    timestamp: number;
}
export interface CMsgDOTAGetPeriodicResourceResponse {
    periodicResourceMax: number;
    periodicResourceUsed: number;
}
export interface CMsgDOTAPeriodicResourceUpdated {
    periodicResourceKey: CMsgDOTAGetPeriodicResource | undefined;
    periodicResourceValue: CMsgDOTAGetPeriodicResourceResponse | undefined;
}
export interface CMsgDOTACompendiumSelection {
    selectionIndex: number;
    selection: number;
    leagueid: number;
}
export interface CMsgDOTACompendiumSelectionResponse {
    eresult: number;
}
export interface CMsgDOTACompendiumRemoveAllSelections {
    leagueid: number;
}
export interface CMsgDOTACompendiumRemoveAllSelectionsResponse {
    eresult: number;
}
export interface CMsgDOTACompendiumData {
    selections: CMsgDOTACompendiumSelection[];
}
export interface CMsgDOTACompendiumDataRequest {
    accountId: number;
    leagueid: number;
}
export interface CMsgDOTACompendiumDataResponse {
    accountId: number;
    leagueid: number;
    result: number;
    compendiumData: CMsgDOTACompendiumData | undefined;
}
export interface CMsgDOTAGetPlayerMatchHistory {
    accountId: number;
    startAtMatchId: string;
    matchesRequested: number;
    heroId: number;
    requestId: number;
    includePracticeMatches: boolean;
    includeCustomGames: boolean;
    includeEventGames: boolean;
}
export interface CMsgDOTAGetPlayerMatchHistoryResponse {
    matches: CMsgDOTAGetPlayerMatchHistoryResponse_Match[];
    requestId: number;
}
export interface CMsgDOTAGetPlayerMatchHistoryResponse_Match {
    matchId: string;
    startTime: number;
    heroId: number;
    winner: boolean;
    gameMode: number;
    rankChange: number;
    previousRank: number;
    lobbyType: number;
    soloRank: boolean;
    abandon: boolean;
    duration: number;
    engine: number;
    activePlusSubscription: boolean;
    seasonalRank: boolean;
    tourneyId: number;
    tourneyRound: number;
    tourneyTier: number;
    tourneyDivision: number;
    teamId: number;
    teamName: string;
    ugcTeamUiLogo: string;
    selectedFacet: number;
}
export interface CMsgGCNotificationsRequest {
}
export interface CMsgGCNotificationsNotification {
    id: string;
    type: number;
    timestamp: number;
    referenceA: number;
    referenceB: number;
    referenceC: number;
    message: string;
    unread: boolean;
}
export interface CMsgGCNotificationsUpdate {
    result: CMsgGCNotificationsUpdate_EResult;
    notifications: CMsgGCNotificationsNotification[];
}
export declare enum CMsgGCNotificationsUpdate_EResult {
    SUCCESS = 0,
    ERROR_UNSPECIFIED = 1
}
export declare function cMsgGCNotificationsUpdate_EResultFromJSON(object: any): CMsgGCNotificationsUpdate_EResult;
export declare function cMsgGCNotificationsUpdate_EResultToJSON(object: CMsgGCNotificationsUpdate_EResult): string;
export interface CMsgGCNotificationsResponse {
    update: CMsgGCNotificationsUpdate | undefined;
}
export interface CMsgGCNotificationsMarkReadRequest {
}
export interface CMsgGCPlayerInfoSubmit {
    name: string;
    countryCode: string;
    fantasyRole: number;
    teamId: number;
    sponsor: string;
}
export interface CMsgGCPlayerInfoSubmitResponse {
    result: CMsgGCPlayerInfoSubmitResponse_EResult;
}
export declare enum CMsgGCPlayerInfoSubmitResponse_EResult {
    SUCCESS = 0,
    ERROR_UNSPECIFIED = 1,
    ERROR_INFO_LOCKED = 2,
    ERROR_NOT_MEMBER_OF_TEAM = 3
}
export declare function cMsgGCPlayerInfoSubmitResponse_EResultFromJSON(object: any): CMsgGCPlayerInfoSubmitResponse_EResult;
export declare function cMsgGCPlayerInfoSubmitResponse_EResultToJSON(object: CMsgGCPlayerInfoSubmitResponse_EResult): string;
export interface CMsgDOTAEmoticonAccessSDO {
    accountId: number;
    unlockedEmoticons: Buffer;
}
export interface CMsgClientToGCEmoticonDataRequest {
}
export interface CMsgGCToClientEmoticonData {
    emoticonAccess: CMsgDOTAEmoticonAccessSDO | undefined;
}
export interface CMsgGCToClientTournamentItemDrop {
    itemDef: number;
    eventType: number;
}
export interface CMsgClientToGCGetAllHeroOrder {
}
export interface CMsgClientToGCGetAllHeroOrderResponse {
    heroIds: number[];
}
export interface CMsgClientToGCGetAllHeroProgress {
    accountId: number;
}
export interface CMsgClientToGCGetAllHeroProgressResponse {
    accountId: number;
    currHeroId: number;
    lapsCompleted: number;
    currHeroGames: number;
    currLapTimeStarted: number;
    currLapGames: number;
    bestLapGames: number;
    bestLapTime: number;
    lapHeroesCompleted: number;
    lapHeroesRemaining: number;
    nextHeroId: number;
    prevHeroId: number;
    prevHeroGames: number;
    prevAvgTries: number;
    currAvgTries: number;
    nextAvgTries: number;
    fullLapAvgTries: number;
    currLapAvgTries: number;
    profileName: string;
    startHeroId: number;
}
export interface CMsgClientToGCGetTrophyList {
    accountId: number;
}
export interface CMsgClientToGCGetTrophyListResponse {
    trophies: CMsgClientToGCGetTrophyListResponse_Trophy[];
}
export interface CMsgClientToGCGetTrophyListResponse_Trophy {
    trophyId: number;
    trophyScore: number;
    lastUpdated: number;
}
export interface CMsgGCToClientTrophyAwarded {
    trophyId: number;
    trophyScore: number;
    trophyOldScore: number;
    lastUpdated: number;
}
export interface CMsgClientToGCRankRequest {
    rankType: ERankType;
}
export interface CMsgGCToClientRankResponse {
    result: CMsgGCToClientRankResponse_EResultCode;
    rankValue: number;
    rankData1: number;
    rankData2: number;
    rankData3: number;
}
export declare enum CMsgGCToClientRankResponse_EResultCode {
    k_Succeeded = 0,
    k_Failed = 1,
    k_InvalidRankType = 2
}
export declare function cMsgGCToClientRankResponse_EResultCodeFromJSON(object: any): CMsgGCToClientRankResponse_EResultCode;
export declare function cMsgGCToClientRankResponse_EResultCodeToJSON(object: CMsgGCToClientRankResponse_EResultCode): string;
export interface CMsgGCToClientRankUpdate {
    rankType: ERankType;
    rankInfo: CMsgGCToClientRankResponse | undefined;
}
export interface CMsgClientToGCGetProfileCard {
    accountId: number;
}
export interface CMsgClientToGCSetProfileCardSlots {
    slots: CMsgClientToGCSetProfileCardSlots_CardSlot[];
}
export interface CMsgClientToGCSetProfileCardSlots_CardSlot {
    slotId: number;
    slotType: EProfileCardSlotType;
    slotValue: string;
}
export interface CMsgClientToGCGetProfileCardStats {
}
export interface CMsgClientToGCCreateHeroStatue {
    sourceItemId: string;
    heroId: number;
    sequenceName: string;
    cycle: number;
    wearables: number[];
    inscription: string;
    styles: number[];
    reforgerItemId: string;
    tournamentDrop: boolean;
}
export interface CMsgGCToClientHeroStatueCreateResult {
    resultingItemId: string;
}
export interface CMsgClientToGCPlayerStatsRequest {
    accountId: number;
}
export interface CMsgGCToClientPlayerStatsResponse {
    accountId: number;
    playerStats: number[];
    matchCount: number;
    meanGpm: number;
    meanXppm: number;
    meanLasthits: number;
    rampages: number;
    tripleKills: number;
    firstBloodClaimed: number;
    firstBloodGiven: number;
    couriersKilled: number;
    aegisesSnatched: number;
    cheesesEaten: number;
    creepsStacked: number;
    fightScore: number;
    farmScore: number;
    supportScore: number;
    pushScore: number;
    versatilityScore: number;
    meanNetworth: number;
    meanDamage: number;
    meanHeals: number;
    rapiersPurchased: number;
}
export interface CMsgClientToGCCustomGamesFriendsPlayedRequest {
}
export interface CMsgGCToClientCustomGamesFriendsPlayedResponse {
    accountId: number;
    games: CMsgGCToClientCustomGamesFriendsPlayedResponse_CustomGame[];
}
export interface CMsgGCToClientCustomGamesFriendsPlayedResponse_CustomGame {
    customGameId: string;
    accountIds: number[];
}
export interface CMsgClientToGCSocialFeedPostCommentRequest {
    eventId: string;
    comment: string;
}
export interface CMsgGCToClientSocialFeedPostCommentResponse {
    success: boolean;
}
export interface CMsgClientToGCSocialFeedPostMessageRequest {
    message: string;
    matchId: string;
    matchTimestamp: number;
}
export interface CMsgGCToClientSocialFeedPostMessageResponse {
    success: boolean;
}
export interface CMsgClientToGCFriendsPlayedCustomGameRequest {
    customGameId: string;
}
export interface CMsgGCToClientFriendsPlayedCustomGameResponse {
    customGameId: string;
    accountIds: number[];
}
export interface CMsgDOTAPartyRichPresence {
    partyId: string;
    partyState: CSODOTAParty_State;
    open: boolean;
    lowPriority: boolean;
    teamId: number;
    teamName: string;
    ugcTeamUiLogo: string;
    members: CMsgDOTAPartyRichPresence_Member[];
    weekendTourney: CMsgDOTAPartyRichPresence_WeekendTourney | undefined;
}
export interface CMsgDOTAPartyRichPresence_Member {
    steamId: string;
    coach: boolean;
}
export interface CMsgDOTAPartyRichPresence_WeekendTourney {
    division: number;
    skillLevel: number;
    round: number;
    tournamentId: number;
    stateSeqNum: number;
    event: EWeekendTourneyRichPresenceEvent;
    eventRound: number;
}
export interface CMsgDOTALobbyRichPresence {
    lobbyId: string;
    lobbyState: CSODOTALobby_State;
    password: boolean;
    gameMode: DOTAGameMode;
    memberCount: number;
    maxMemberCount: number;
    customGameId: string;
    name: string;
    lobbyType: number;
}
export interface CMsgDOTACustomGameListenServerStartedLoading {
    lobbyId: string;
    customGameId: string;
    lobbyMembers: number[];
    startTime: number;
}
export interface CMsgDOTACustomGameClientFinishedLoading {
    lobbyId: string;
    loadingDuration: number;
    resultCode: number;
    resultString: string;
    signonStates: number;
    comment: string;
}
export interface CMsgClientToGCApplyGemCombiner {
    itemId1: string;
    itemId2: string;
}
export interface CMsgClientToGCH264Unsupported {
}
export interface CMsgClientToGCGetQuestProgress {
    questIds: number[];
}
export interface CMsgClientToGCGetQuestProgressResponse {
    success: boolean;
    quests: CMsgClientToGCGetQuestProgressResponse_Quest[];
}
export interface CMsgClientToGCGetQuestProgressResponse_Challenge {
    challengeId: number;
    timeCompleted: number;
    attempts: number;
    heroId: number;
    templateId: number;
    questRank: number;
}
export interface CMsgClientToGCGetQuestProgressResponse_Quest {
    questId: number;
    completedChallenges: CMsgClientToGCGetQuestProgressResponse_Challenge[];
}
export interface CMsgGCToClientMatchSignedOut {
    matchId: string;
}
export interface CMsgGCGetHeroStatsHistory {
    heroId: number;
}
export interface CMsgGCGetHeroStatsHistoryResponse {
    heroId: number;
    records: CMsgDOTASDOHeroStatsHistory[];
}
export interface CMsgPlayerConductScorecardRequest {
}
export interface CMsgPlayerConductScorecard {
    accountId: number;
    matchId: string;
    seqNum: number;
    reasons: number;
    matchesInReport: number;
    matchesClean: number;
    matchesReported: number;
    matchesAbandoned: number;
    reportsCount: number;
    reportsParties: number;
    commendCount: number;
    date: number;
    rawBehaviorScore: number;
    oldRawBehaviorScore: number;
    commsReports: number;
    commsParties: number;
    behaviorRating: CMsgPlayerConductScorecard_EBehaviorRating;
}
export declare enum CMsgPlayerConductScorecard_EBehaviorRating {
    k_eBehaviorGood = 0,
    k_eBehaviorWarning = 1,
    k_eBehaviorBad = 2
}
export declare function cMsgPlayerConductScorecard_EBehaviorRatingFromJSON(object: any): CMsgPlayerConductScorecard_EBehaviorRating;
export declare function cMsgPlayerConductScorecard_EBehaviorRatingToJSON(object: CMsgPlayerConductScorecard_EBehaviorRating): string;
export interface CMsgClientToGCWageringRequest {
    eventId: number;
}
export interface CMsgGCToClientWageringResponse {
    coinsRemaining: number;
    totalPointsWon: number;
    totalPointsWagered: number;
    totalPointsTipped: number;
    successRate: number;
    totalGamesWagered: number;
    coinsMax: number;
    rankWagersRemaining: number;
    rankWagersMax: number;
    predictionTokensRemaining: number;
    predictionTokensMax: number;
    bountiesRemaining: number;
    bountiesMax: number;
}
export interface CMsgGCToClientWageringUpdate {
    eventId: number;
    wageringInfo: CMsgGCToClientWageringResponse | undefined;
}
export interface CMsgGCToClientArcanaVotesUpdate {
    eventId: number;
    arcanaVotes: CMsgClientToGCRequestArcanaVotesRemainingResponse | undefined;
}
export interface CMsgClientToGCGetEventGoals {
    eventIds: EEvent[];
}
export interface CMsgEventGoals {
    eventGoals: CMsgEventGoals_EventGoal[];
}
export interface CMsgEventGoals_EventGoal {
    eventId: EEvent;
    goalId: number;
    value: string;
}
export interface CMsgGCToGCLeaguePredictions {
    leagueId: number;
}
export interface CMsgPredictionRankings {
    predictions: CMsgPredictionRankings_Prediction[];
}
export interface CMsgPredictionRankings_PredictionLine {
    answerId: number;
    answerName: string;
    answerLogo: string;
    answerValue: number;
}
export interface CMsgPredictionRankings_Prediction {
    selectionId: number;
    predictionLines: CMsgPredictionRankings_PredictionLine[];
}
export interface CMsgPredictionResults {
    results: CMsgPredictionResults_Result[];
}
export interface CMsgPredictionResults_ResultBreakdown {
    answerSelection: number;
    answerValue: number;
}
export interface CMsgPredictionResults_Result {
    selectionId: number;
    resultBreakdown: CMsgPredictionResults_ResultBreakdown[];
}
export interface CMsgClientToGCHasPlayerVotedForMVP {
    matchId: string;
}
export interface CMsgClientToGCHasPlayerVotedForMVPResponse {
    result: boolean;
}
export interface CMsgClientToGCVoteForMVP {
    matchId: string;
    accountId: number;
}
export interface CMsgClientToGCVoteForMVPResponse {
    result: boolean;
}
export interface CMsgClientToGCMVPVoteTimeout {
    matchId: string;
}
export interface CMsgClientToGCMVPVoteTimeoutResponse {
    result: boolean;
}
export interface CMsgClientToGCTeammateStatsRequest {
}
export interface CMsgClientToGCTeammateStatsResponse {
    success: boolean;
    teammateStats: CMsgClientToGCTeammateStatsResponse_TeammateStat[];
}
export interface CMsgClientToGCTeammateStatsResponse_TeammateStat {
    accountId: number;
    games: number;
    wins: number;
    mostRecentGameTimestamp: number;
    mostRecentGameMatchId: string;
    performance: number;
}
export interface CMsgClientToGCVoteForArcana {
    matches: CMsgArcanaVoteMatchVotes[];
}
export interface CMsgClientToGCVoteForArcanaResponse {
    result: CMsgClientToGCVoteForArcanaResponse_Result;
}
export declare enum CMsgClientToGCVoteForArcanaResponse_Result {
    SUCCEEDED = 0,
    VOTING_NOT_ENABLED_FOR_ROUND = 1,
    UNKNOWN_FAILURE = 2
}
export declare function cMsgClientToGCVoteForArcanaResponse_ResultFromJSON(object: any): CMsgClientToGCVoteForArcanaResponse_Result;
export declare function cMsgClientToGCVoteForArcanaResponse_ResultToJSON(object: CMsgClientToGCVoteForArcanaResponse_Result): string;
export interface CMsgClientToGCRequestArcanaVotesRemaining {
}
export interface CMsgClientToGCRequestArcanaVotesRemainingResponse {
    result: boolean;
    votesRemaining: number;
    votesTotal: number;
    matchesPreviouslyVotedFor: CMsgArcanaVoteMatchVotes[];
}
export interface CMsgClientToGCRequestEventPointLogV2 {
    eventId: number;
}
export interface CMsgClientToGCRequestEventPointLogResponseV2 {
    result: boolean;
    eventId: EEvent;
    logEntries: CMsgClientToGCRequestEventPointLogResponseV2_LogEntry[];
}
export interface CMsgClientToGCRequestEventPointLogResponseV2_LogEntry {
    timestamp: number;
    auditAction: number;
    eventPoints: number;
    auditData: string;
}
export interface CMsgClientToGCPublishUserStat {
    userStatsEvent: number;
    referenceData: string;
}
export interface CMsgClientToGCRequestSlarkGameResult {
    eventId: EEvent;
    slotChosen: number;
    week: number;
}
export interface CMsgClientToGCRequestSlarkGameResultResponse {
    pointsWon: number;
    auraWon: boolean;
}
export interface CMsgGCToClientQuestProgressUpdated {
    questId: number;
    completedChallenges: CMsgGCToClientQuestProgressUpdated_Challenge[];
}
export interface CMsgGCToClientQuestProgressUpdated_Challenge {
    challengeId: number;
    timeCompleted: number;
    attempts: number;
    heroId: number;
    templateId: number;
    questRank: number;
    maxQuestRank: number;
}
export interface CMsgDOTARedeemItem {
    currencyId: string;
    purchaseDef: number;
}
export interface CMsgDOTARedeemItemResponse {
    response: CMsgDOTARedeemItemResponse_EResultCode;
}
export declare enum CMsgDOTARedeemItemResponse_EResultCode {
    k_Succeeded = 0,
    k_Failed = 1
}
export declare function cMsgDOTARedeemItemResponse_EResultCodeFromJSON(object: any): CMsgDOTARedeemItemResponse_EResultCode;
export declare function cMsgDOTARedeemItemResponse_EResultCodeToJSON(object: CMsgDOTARedeemItemResponse_EResultCode): string;
export interface CMsgClientToGCSelectCompendiumInGamePrediction {
    matchId: string;
    predictions: CMsgClientToGCSelectCompendiumInGamePrediction_Prediction[];
    leagueId: number;
}
export interface CMsgClientToGCSelectCompendiumInGamePrediction_Prediction {
    predictionId: number;
    predictionValue: number;
}
export interface CMsgClientToGCSelectCompendiumInGamePredictionResponse {
    result: CMsgClientToGCSelectCompendiumInGamePredictionResponse_EResult;
}
export declare enum CMsgClientToGCSelectCompendiumInGamePredictionResponse_EResult {
    SUCCESS = 0,
    INVALID_MATCH = 1,
    PREDICTIONS_ARE_CLOSED = 2,
    OTHER_ERROR = 3
}
export declare function cMsgClientToGCSelectCompendiumInGamePredictionResponse_EResultFromJSON(object: any): CMsgClientToGCSelectCompendiumInGamePredictionResponse_EResult;
export declare function cMsgClientToGCSelectCompendiumInGamePredictionResponse_EResultToJSON(object: CMsgClientToGCSelectCompendiumInGamePredictionResponse_EResult): string;
export interface CMsgClientToGCOpenPlayerCardPack {
    playerCardPackItemId: string;
    teamId: number;
    deprecatedLeagueId: number;
    region: ELeagueRegion;
}
export interface CMsgClientToGCOpenPlayerCardPackResponse {
    result: CMsgClientToGCOpenPlayerCardPackResponse_Result;
    playerCardItemIds: string[];
}
export declare enum CMsgClientToGCOpenPlayerCardPackResponse_Result {
    SUCCESS = 1,
    ERROR_INTERNAL = 2,
    ERROR_FAILED_TO_FIND_PACK = 3,
    ERROR_ITEM_NOT_CARD_PACK = 4,
    ERROR_FAILED_CARD_CREATE = 5,
    ERROR_INVALID_TEAM_ID_ATTRIBUTE = 6,
    ERROR_INVALID_TEAM_ID = 7
}
export declare function cMsgClientToGCOpenPlayerCardPackResponse_ResultFromJSON(object: any): CMsgClientToGCOpenPlayerCardPackResponse_Result;
export declare function cMsgClientToGCOpenPlayerCardPackResponse_ResultToJSON(object: CMsgClientToGCOpenPlayerCardPackResponse_Result): string;
export interface CMsgClientToGCRecyclePlayerCard {
    playerCardItemIds: string[];
    eventId: number;
}
export interface CMsgClientToGCRecyclePlayerCardResponse {
    result: CMsgClientToGCRecyclePlayerCardResponse_Result;
    dustAmount: number;
}
export declare enum CMsgClientToGCRecyclePlayerCardResponse_Result {
    SUCCESS = 1,
    ERROR_INTERNAL = 2,
    ERROR_FAILED_TO_FIND_PLAYER_CARD = 3,
    ERROR_ITEM_NOT_PLAYER_CARD = 4,
    ERROR_FAILED_DUST_CARD_CREATE = 5,
    ERROR_CARD_LOCKED = 6,
    ERROR_NO_CARDS_SPECIFIED = 7
}
export declare function cMsgClientToGCRecyclePlayerCardResponse_ResultFromJSON(object: any): CMsgClientToGCRecyclePlayerCardResponse_Result;
export declare function cMsgClientToGCRecyclePlayerCardResponse_ResultToJSON(object: CMsgClientToGCRecyclePlayerCardResponse_Result): string;
export interface CMsgClientToGCCreatePlayerCardPack {
    cardDustItemId: string;
    eventId: number;
    premiumPack: boolean;
}
export interface CMsgClientToGCCreatePlayerCardPackResponse {
    result: CMsgClientToGCCreatePlayerCardPackResponse_Result;
}
export declare enum CMsgClientToGCCreatePlayerCardPackResponse_Result {
    SUCCESS = 1,
    ERROR_INTERNAL = 2,
    ERROR_INSUFFICIENT_DUST = 3,
    ERROR_ITEM_NOT_DUST_ITEM = 4,
    ERROR_FAILED_CARD_PACK_CREATE = 5,
    ERROR_NO_CARD_PACK = 6,
    ERROR_NOT_AVAILABLE = 7
}
export declare function cMsgClientToGCCreatePlayerCardPackResponse_ResultFromJSON(object: any): CMsgClientToGCCreatePlayerCardPackResponse_Result;
export declare function cMsgClientToGCCreatePlayerCardPackResponse_ResultToJSON(object: CMsgClientToGCCreatePlayerCardPackResponse_Result): string;
export interface CMsgClientToGCCreateTeamPlayerCardPack {
    cardDustItemId: string;
    eventId: number;
    premiumPack: boolean;
    teamId: number;
}
export interface CMsgClientToGCCreateTeamPlayerCardPackResponse {
    result: CMsgClientToGCCreateTeamPlayerCardPackResponse_Result;
}
export declare enum CMsgClientToGCCreateTeamPlayerCardPackResponse_Result {
    SUCCESS = 1,
    ERROR_INTERNAL = 2,
    ERROR_INSUFFICIENT_DUST = 3,
    ERROR_ITEM_NOT_DUST_ITEM = 4,
    ERROR_FAILED_CARD_PACK_CREATE = 5,
    ERROR_NO_CARD_PACK = 6,
    ERROR_NOT_AVAILABLE = 7
}
export declare function cMsgClientToGCCreateTeamPlayerCardPackResponse_ResultFromJSON(object: any): CMsgClientToGCCreateTeamPlayerCardPackResponse_Result;
export declare function cMsgClientToGCCreateTeamPlayerCardPackResponse_ResultToJSON(object: CMsgClientToGCCreateTeamPlayerCardPackResponse_Result): string;
export interface CMsgGCToClientBattlePassRollupInternational2016 {
    battlePassLevel: number;
    questlines: CMsgGCToClientBattlePassRollupInternational2016_Questlines[];
    wagering: CMsgGCToClientBattlePassRollupInternational2016_Wagering | undefined;
    achievements: CMsgGCToClientBattlePassRollupInternational2016_Achievements | undefined;
    battleCup: CMsgGCToClientBattlePassRollupInternational2016_BattleCup | undefined;
    predictions: CMsgGCToClientBattlePassRollupInternational2016_Predictions | undefined;
    bracket: CMsgGCToClientBattlePassRollupInternational2016_Bracket | undefined;
    playerCards: CMsgGCToClientBattlePassRollupInternational2016_PlayerCard[];
    fantasyChallenge: CMsgGCToClientBattlePassRollupInternational2016_FantasyChallenge | undefined;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_Questlines {
    name: string;
    onestar: number;
    twostar: number;
    threestar: number;
    total: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_Wagering {
    totalWagered: number;
    totalWon: number;
    averageWon: number;
    successRate: number;
    totalTips: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_Achievements {
    completed: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_BattleCup {
    wins: number;
    score: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_Predictions {
    correct: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_Bracket {
    correct: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_PlayerCard {
    accountId: number;
    quality: number;
}
export interface CMsgGCToClientBattlePassRollupInternational2016_FantasyChallenge {
    totalScore: number;
    percentile: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016 {
    battlePassLevel: number;
    questlines: CMsgGCToClientBattlePassRollupFall2016_Questlines[];
    wagering: CMsgGCToClientBattlePassRollupFall2016_Wagering | undefined;
    achievements: CMsgGCToClientBattlePassRollupFall2016_Achievements | undefined;
    battleCup: CMsgGCToClientBattlePassRollupFall2016_BattleCup | undefined;
    predictions: CMsgGCToClientBattlePassRollupFall2016_Predictions | undefined;
    bracket: CMsgGCToClientBattlePassRollupFall2016_Bracket | undefined;
    playerCards: CMsgGCToClientBattlePassRollupFall2016_PlayerCard[];
    fantasyChallenge: CMsgGCToClientBattlePassRollupFall2016_FantasyChallenge | undefined;
}
export interface CMsgGCToClientBattlePassRollupFall2016_Questlines {
    name: string;
    onestar: number;
    twostar: number;
    threestar: number;
    total: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_Wagering {
    totalWagered: number;
    totalWon: number;
    averageWon: number;
    successRate: number;
    totalTips: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_Achievements {
    completed: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_BattleCup {
    wins: number;
    score: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_Predictions {
    correct: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_Bracket {
    correct: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_PlayerCard {
    accountId: number;
    quality: number;
}
export interface CMsgGCToClientBattlePassRollupFall2016_FantasyChallenge {
    totalScore: number;
    percentile: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017 {
    battlePassLevel: number;
    questlines: CMsgGCToClientBattlePassRollupWinter2017_Questlines[];
    wagering: CMsgGCToClientBattlePassRollupWinter2017_Wagering | undefined;
    achievements: CMsgGCToClientBattlePassRollupWinter2017_Achievements | undefined;
    battleCup: CMsgGCToClientBattlePassRollupWinter2017_BattleCup | undefined;
    predictions: CMsgGCToClientBattlePassRollupWinter2017_Predictions | undefined;
    bracket: CMsgGCToClientBattlePassRollupWinter2017_Bracket | undefined;
    playerCards: CMsgGCToClientBattlePassRollupWinter2017_PlayerCard[];
    fantasyChallenge: CMsgGCToClientBattlePassRollupWinter2017_FantasyChallenge | undefined;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_Questlines {
    name: string;
    onestar: number;
    twostar: number;
    threestar: number;
    total: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_Wagering {
    totalWagered: number;
    totalWon: number;
    averageWon: number;
    successRate: number;
    totalTips: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_Achievements {
    completed: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_BattleCup {
    wins: number;
    score: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_Predictions {
    correct: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_Bracket {
    correct: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_PlayerCard {
    accountId: number;
    quality: number;
}
export interface CMsgGCToClientBattlePassRollupWinter2017_FantasyChallenge {
    totalScore: number;
    percentile: number;
}
export interface CMsgGCToClientBattlePassRollupTI7 {
    battlePassLevel: number;
    questlines: CMsgGCToClientBattlePassRollupTI7_Questlines[];
    wagering: CMsgGCToClientBattlePassRollupTI7_Wagering | undefined;
    achievements: CMsgGCToClientBattlePassRollupTI7_Achievements | undefined;
    battleCup: CMsgGCToClientBattlePassRollupTI7_BattleCup | undefined;
    predictions: CMsgGCToClientBattlePassRollupTI7_Predictions | undefined;
    bracket: CMsgGCToClientBattlePassRollupTI7_Bracket | undefined;
    playerCards: CMsgGCToClientBattlePassRollupTI7_PlayerCard[];
    fantasyChallenge: CMsgGCToClientBattlePassRollupTI7_FantasyChallenge | undefined;
}
export interface CMsgGCToClientBattlePassRollupTI7_Questlines {
    name: string;
    onestar: number;
    twostar: number;
    threestar: number;
    total: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_Wagering {
    totalWagered: number;
    totalWon: number;
    averageWon: number;
    successRate: number;
    totalTips: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_Achievements {
    completed: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_BattleCup {
    wins: number;
    score: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_Predictions {
    correct: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_Bracket {
    correct: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_PlayerCard {
    accountId: number;
    quality: number;
}
export interface CMsgGCToClientBattlePassRollupTI7_FantasyChallenge {
    totalScore: number;
    percentile: number;
}
export interface CMsgGCToClientBattlePassRollupTI8 {
    battlePassLevel: number;
    cavernCrawl: CMsgGCToClientBattlePassRollupTI8_CavernCrawl | undefined;
    wagering: CMsgGCToClientBattlePassRollupTI8_Wagering | undefined;
    achievements: CMsgGCToClientBattlePassRollupTI8_Achievements | undefined;
    predictions: CMsgGCToClientBattlePassRollupTI8_Predictions | undefined;
    bracket: CMsgGCToClientBattlePassRollupTI8_Bracket | undefined;
    playerCards: CMsgGCToClientBattlePassRollupTI8_PlayerCard[];
    fantasyChallenge: CMsgGCToClientBattlePassRollupTI8_FantasyChallenge | undefined;
}
export interface CMsgGCToClientBattlePassRollupTI8_CavernCrawl {
    roomsCleared: number;
    carryCompleted: boolean;
    supportCompleted: boolean;
    utilityCompleted: boolean;
}
export interface CMsgGCToClientBattlePassRollupTI8_Wagering {
    totalWagered: number;
    totalWon: number;
    averageWon: number;
    successRate: number;
    totalTips: number;
}
export interface CMsgGCToClientBattlePassRollupTI8_Achievements {
    completed: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI8_Predictions {
    correct: number;
    total: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI8_Bracket {
    correct: number;
    points: number;
}
export interface CMsgGCToClientBattlePassRollupTI8_PlayerCard {
    accountId: number;
    quality: number;
}
export interface CMsgGCToClientBattlePassRollupTI8_FantasyChallenge {
    totalScore: number;
    percentile: number;
}
export interface CMsgGCToClientBattlePassRollupTI9 {
    battlePassLevel: number;
}
export interface CMsgGCToClientBattlePassRollupTI10 {
    battlePassLevel: number;
}
export interface CMsgGCToClientBattlePassRollupRequest {
    eventId: number;
    accountId: number;
}
export interface CMsgGCToClientBattlePassRollupResponse {
    eventTi6: CMsgGCToClientBattlePassRollupInternational2016 | undefined;
    eventFall2016: CMsgGCToClientBattlePassRollupFall2016 | undefined;
    eventWinter2017: CMsgGCToClientBattlePassRollupWinter2017 | undefined;
    eventTi7: CMsgGCToClientBattlePassRollupTI7 | undefined;
    eventTi8: CMsgGCToClientBattlePassRollupTI8 | undefined;
    eventTi9: CMsgGCToClientBattlePassRollupTI9 | undefined;
    eventTi10: CMsgGCToClientBattlePassRollupTI10 | undefined;
}
export interface CMsgGCToClientBattlePassRollupListRequest {
    accountId: number;
}
export interface CMsgGCToClientBattlePassRollupListResponse {
    eventInfo: CMsgGCToClientBattlePassRollupListResponse_EventInfo[];
}
export interface CMsgGCToClientBattlePassRollupListResponse_EventInfo {
    eventId: number;
    level: number;
}
export interface CMsgClientToGCTransferSeasonalMMRRequest {
    isParty: boolean;
}
export interface CMsgClientToGCTransferSeasonalMMRResponse {
    success: boolean;
}
export interface CMsgGCToClientPlaytestStatus {
    active: boolean;
}
export interface CMsgClientToGCJoinPlaytest {
    clientVersion: number;
}
export interface CMsgClientToGCJoinPlaytestResponse {
    error: string;
}
export interface CMsgDOTASetFavoriteTeam {
    teamId: number;
    eventId: number;
}
export interface CMsgDOTATriviaCurrentQuestions {
    questions: CMsgDOTATriviaQuestion[];
    triviaEnabled: boolean;
}
export interface CMsgDOTASubmitTriviaQuestionAnswer {
    questionId: number;
    answerIndex: number;
}
export interface CMsgDOTASubmitTriviaQuestionAnswerResponse {
    result: EDOTATriviaAnswerResult;
}
export interface CMsgDOTAStartTriviaSession {
}
export interface CMsgDOTAStartTriviaSessionResponse {
    triviaEnabled: boolean;
    currentTimestamp: number;
}
export interface CMsgDOTAAnchorPhoneNumberRequest {
}
export interface CMsgDOTAAnchorPhoneNumberResponse {
    result: CMsgDOTAAnchorPhoneNumberResponse_Result;
}
export declare enum CMsgDOTAAnchorPhoneNumberResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    ERROR_NO_STEAM_PHONE = 2,
    ERROR_ALREADY_IN_USE = 3,
    ERROR_COOLDOWN_ACTIVE = 4,
    ERROR_GAC_ISSUE = 5
}
export declare function cMsgDOTAAnchorPhoneNumberResponse_ResultFromJSON(object: any): CMsgDOTAAnchorPhoneNumberResponse_Result;
export declare function cMsgDOTAAnchorPhoneNumberResponse_ResultToJSON(object: CMsgDOTAAnchorPhoneNumberResponse_Result): string;
export interface CMsgDOTAUnanchorPhoneNumberRequest {
}
export interface CMsgDOTAUnanchorPhoneNumberResponse {
    result: CMsgDOTAUnanchorPhoneNumberResponse_Result;
}
export declare enum CMsgDOTAUnanchorPhoneNumberResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1
}
export declare function cMsgDOTAUnanchorPhoneNumberResponse_ResultFromJSON(object: any): CMsgDOTAUnanchorPhoneNumberResponse_Result;
export declare function cMsgDOTAUnanchorPhoneNumberResponse_ResultToJSON(object: CMsgDOTAUnanchorPhoneNumberResponse_Result): string;
export interface CMsgGCToClientCommendNotification {
    commenderAccountId: number;
    commenderName: string;
    flags: number;
    commenderHeroId: number;
}
export interface CMsgDOTAClientToGCQuickStatsRequest {
    playerAccountId: number;
    heroId: number;
    itemId: number;
    leagueId: number;
}
export interface CMsgDOTAClientToGCQuickStatsResponse {
    originalRequest: CMsgDOTAClientToGCQuickStatsRequest | undefined;
    heroStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
    itemStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
    itemHeroStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
    itemPlayerStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
    heroPlayerStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
    fullSetStats: CMsgDOTAClientToGCQuickStatsResponse_SimpleStats | undefined;
}
export interface CMsgDOTAClientToGCQuickStatsResponse_SimpleStats {
    winPercent: number;
    pickPercent: number;
    winCount: number;
    pickCount: number;
}
export interface CMsgDOTASelectionPriorityChoiceRequest {
    choice: DOTASelectionPriorityChoice;
}
export interface CMsgDOTASelectionPriorityChoiceResponse {
    result: CMsgDOTASelectionPriorityChoiceResponse_Result;
}
export declare enum CMsgDOTASelectionPriorityChoiceResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1
}
export declare function cMsgDOTASelectionPriorityChoiceResponse_ResultFromJSON(object: any): CMsgDOTASelectionPriorityChoiceResponse_Result;
export declare function cMsgDOTASelectionPriorityChoiceResponse_ResultToJSON(object: CMsgDOTASelectionPriorityChoiceResponse_Result): string;
export interface CMsgDOTAGameAutographReward {
    badgeId: string;
}
export interface CMsgDOTAGameAutographRewardResponse {
    result: CMsgDOTAGameAutographRewardResponse_Result;
}
export declare enum CMsgDOTAGameAutographRewardResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1
}
export declare function cMsgDOTAGameAutographRewardResponse_ResultFromJSON(object: any): CMsgDOTAGameAutographRewardResponse_Result;
export declare function cMsgDOTAGameAutographRewardResponse_ResultToJSON(object: CMsgDOTAGameAutographRewardResponse_Result): string;
export interface CMsgDOTADestroyLobbyRequest {
}
export interface CMsgDOTADestroyLobbyResponse {
    result: CMsgDOTADestroyLobbyResponse_Result;
}
export declare enum CMsgDOTADestroyLobbyResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1
}
export declare function cMsgDOTADestroyLobbyResponse_ResultFromJSON(object: any): CMsgDOTADestroyLobbyResponse_Result;
export declare function cMsgDOTADestroyLobbyResponse_ResultToJSON(object: CMsgDOTADestroyLobbyResponse_Result): string;
export interface CMsgDOTAGetRecentPlayTimeFriendsRequest {
}
export interface CMsgDOTAGetRecentPlayTimeFriendsResponse {
    accountIds: number[];
}
export interface CMsgPurchaseItemWithEventPoints {
    itemDef: number;
    quantity: number;
    eventId: EEvent;
    usePremiumPoints: boolean;
}
export interface CMsgPurchaseItemWithEventPointsResponse {
    result: CMsgPurchaseItemWithEventPointsResponse_Result;
}
export declare enum CMsgPurchaseItemWithEventPointsResponse_Result {
    SUCCESS = 0,
    UNKNOWN_EVENT = 1,
    UNKNOWN_ITEM = 2,
    BAD_QUANTITY = 3,
    NOT_PURCHASEABLE = 4,
    SDO_LOAD_FAILED = 5,
    NOT_ENOUGH_POINTS = 6,
    SQL_ERROR = 7,
    FAILED_TO_SEND = 8,
    SERVER_ERROR = 9,
    NOT_ALLOWED = 10,
    CANCELLED = 11,
    CLIENT_ERROR = 12,
    SUBSCRIPTION_REQUIRED = 13
}
export declare function cMsgPurchaseItemWithEventPointsResponse_ResultFromJSON(object: any): CMsgPurchaseItemWithEventPointsResponse_Result;
export declare function cMsgPurchaseItemWithEventPointsResponse_ResultToJSON(object: CMsgPurchaseItemWithEventPointsResponse_Result): string;
export interface CMsgPurchaseHeroRandomRelic {
    heroId: number;
    relicRarity: EHeroRelicRarity;
}
export interface CMsgPurchaseHeroRandomRelicResponse {
    result: EPurchaseHeroRelicResult;
    killEaterType: number;
}
export interface CMsgClientToGCRequestPlusWeeklyChallengeResult {
    eventId: EEvent;
    week: number;
}
export interface CMsgClientToGCRequestPlusWeeklyChallengeResultResponse {
}
export interface CMsgProfileRequest {
    accountId: number;
}
export interface CMsgProfileResponse {
    backgroundItem: CSOEconItem | undefined;
    featuredHeroes: CMsgProfileResponse_FeaturedHero[];
    recentMatches: CMsgProfileResponse_MatchInfo[];
    successfulHeroes: CMsgSuccessfulHero[];
    recentMatchDetails: CMsgRecentMatchInfo | undefined;
    result: CMsgProfileResponse_EResponse;
    stickerbookPage: CMsgStickerbookPage | undefined;
}
export declare enum CMsgProfileResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3
}
export declare function cMsgProfileResponse_EResponseFromJSON(object: any): CMsgProfileResponse_EResponse;
export declare function cMsgProfileResponse_EResponseToJSON(object: CMsgProfileResponse_EResponse): string;
export interface CMsgProfileResponse_FeaturedHero {
    heroId: number;
    equippedEconItems: CSOEconItem[];
    manuallySet: boolean;
    plusHeroXp: number;
    plusHeroRelicsItem: CSOEconItem | undefined;
}
export interface CMsgProfileResponse_MatchInfo {
    matchId: string;
    matchTimestamp: number;
    performanceRating: number;
    heroId: number;
    wonMatch: boolean;
}
export interface CMsgProfileUpdate {
    backgroundItemId: string;
    featuredHeroIds: number[];
}
export interface CMsgProfileUpdateResponse {
    result: CMsgProfileUpdateResponse_Result;
}
export declare enum CMsgProfileUpdateResponse_Result {
    SUCCESS = 0,
    FAILURE = 1,
    FAILURE_BAD_HERO1 = 2,
    FAILURE_BAD_HERO2 = 3,
    FAILURE_BAD_HERO3 = 4
}
export declare function cMsgProfileUpdateResponse_ResultFromJSON(object: any): CMsgProfileUpdateResponse_Result;
export declare function cMsgProfileUpdateResponse_ResultToJSON(object: CMsgProfileUpdateResponse_Result): string;
export interface CMsgTalentWinRates {
    lastRun: number;
    abilityId: number;
    gameCount: number;
    winCount: number;
}
export interface CMsgGlobalHeroAverages {
    lastRun: number;
    avgGoldPerMin: number;
    avgXpPerMin: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgLastHits: number;
    avgDenies: number;
    avgNetWorth: number;
}
export interface CMsgHeroGlobalDataRequest {
    heroId: number;
}
export interface CMsgHeroGlobalDataResponse {
    heroId: number;
    heroDataPerChunk: CMsgHeroGlobalDataResponse_HeroDataPerRankChunk[];
}
export interface CMsgHeroGlobalDataResponse_GraphData {
    day: number;
    winPercent: number;
    pickPercent: number;
    banPercent: number;
}
export interface CMsgHeroGlobalDataResponse_WeekData {
    week: number;
    winPercent: number;
    pickPercent: number;
    banPercent: number;
}
export interface CMsgHeroGlobalDataResponse_HeroDataPerRankChunk {
    rankChunk: number;
    talentWinRates: CMsgTalentWinRates[];
    heroAverages: CMsgGlobalHeroAverages | undefined;
    graphData: CMsgHeroGlobalDataResponse_GraphData[];
    weekData: CMsgHeroGlobalDataResponse_WeekData[];
}
export interface CMsgHeroGlobalDataAllHeroes {
    heroes: CMsgHeroGlobalDataResponse[];
}
export interface CMsgHeroGlobalDataHeroesAlliesAndEnemies {
    rankedHeroData: CMsgHeroGlobalDataHeroesAlliesAndEnemies_RankedHeroData[];
}
export interface CMsgHeroGlobalDataHeroesAlliesAndEnemies_HeroData {
    heroId: number;
    winRate: number;
    firstOtherHeroId: number;
    allyWinRate: number[];
    enemyWinRate: number[];
}
export interface CMsgHeroGlobalDataHeroesAlliesAndEnemies_RankedHeroData {
    rank: number;
    heroData: CMsgHeroGlobalDataHeroesAlliesAndEnemies_HeroData[];
}
export interface CMsgPrivateMetadataKeyRequest {
    matchId: string;
}
export interface CMsgPrivateMetadataKeyResponse {
    privateKey: number;
}
export interface CMsgActivatePlusFreeTrialResponse {
    result: CMsgActivatePlusFreeTrialResponse_Result;
}
export declare enum CMsgActivatePlusFreeTrialResponse_Result {
    SUCCESS = 0,
    ERROR_GENERIC = 1,
    ERROR_ALREADY_IN_FREE_TRIAL = 2,
    ERROR_ALREADY_USED_FREE_TRIAL = 3,
    ERROR_OFFER_NOT_VALID = 4
}
export declare function cMsgActivatePlusFreeTrialResponse_ResultFromJSON(object: any): CMsgActivatePlusFreeTrialResponse_Result;
export declare function cMsgActivatePlusFreeTrialResponse_ResultToJSON(object: CMsgActivatePlusFreeTrialResponse_Result): string;
export interface CMsgGCToClientCavernCrawlMapPathCompleted {
    eventId: number;
    heroIdCompleted: number;
    completedPaths: CMsgGCToClientCavernCrawlMapPathCompleted_CompletedPathInfo[];
    mapVariant: number;
}
export interface CMsgGCToClientCavernCrawlMapPathCompleted_CompletedPathInfo {
    pathIdCompleted: number;
    receivedUltraRareReward: boolean;
    halfCompleted: boolean;
}
export interface CMsgGCToClientCavernCrawlMapUpdated {
    eventId: number;
}
export interface CMsgClientToGCCavernCrawlClaimRoom {
    eventId: number;
    roomId: number;
    mapVariant: number;
}
export interface CMsgClientToGCCavernCrawlClaimRoomResponse {
    result: CMsgClientToGCCavernCrawlClaimRoomResponse_Result;
}
export declare enum CMsgClientToGCCavernCrawlClaimRoomResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    RECEIVED_ULTRA_RARE_REWARD = 2
}
export declare function cMsgClientToGCCavernCrawlClaimRoomResponse_ResultFromJSON(object: any): CMsgClientToGCCavernCrawlClaimRoomResponse_Result;
export declare function cMsgClientToGCCavernCrawlClaimRoomResponse_ResultToJSON(object: CMsgClientToGCCavernCrawlClaimRoomResponse_Result): string;
export interface CMsgClientToGCCavernCrawlUseItemOnRoom {
    eventId: number;
    roomId: number;
    itemType: number;
    mapVariant: number;
}
export interface CMsgClientToGCCavernCrawlUseItemOnRoomResponse {
    result: CMsgClientToGCCavernCrawlUseItemOnRoomResponse_Result;
}
export declare enum CMsgClientToGCCavernCrawlUseItemOnRoomResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    RECEIVED_ULTRA_RARE_REWARD = 2
}
export declare function cMsgClientToGCCavernCrawlUseItemOnRoomResponse_ResultFromJSON(object: any): CMsgClientToGCCavernCrawlUseItemOnRoomResponse_Result;
export declare function cMsgClientToGCCavernCrawlUseItemOnRoomResponse_ResultToJSON(object: CMsgClientToGCCavernCrawlUseItemOnRoomResponse_Result): string;
export interface CMsgClientToGCCavernCrawlUseItemOnPath {
    eventId: number;
    pathId: number;
    itemType: number;
    mapVariant: number;
}
export interface CMsgClientToGCCavernCrawlUseItemOnPathResponse {
    result: CMsgClientToGCCavernCrawlUseItemOnPathResponse_Result;
}
export declare enum CMsgClientToGCCavernCrawlUseItemOnPathResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    RECEIVED_ULTRA_RARE_REWARD = 2
}
export declare function cMsgClientToGCCavernCrawlUseItemOnPathResponse_ResultFromJSON(object: any): CMsgClientToGCCavernCrawlUseItemOnPathResponse_Result;
export declare function cMsgClientToGCCavernCrawlUseItemOnPathResponse_ResultToJSON(object: CMsgClientToGCCavernCrawlUseItemOnPathResponse_Result): string;
export interface CMsgClientToGCCavernCrawlRequestMapState {
    eventId: number;
}
export interface CMsgClientToGCCavernCrawlRequestMapStateResponse {
    result: CMsgClientToGCCavernCrawlRequestMapStateResponse_Result;
    availableMapVariantsMask: number;
    inventoryItem: CMsgClientToGCCavernCrawlRequestMapStateResponse_InventoryItem[];
    mapVariants: CMsgClientToGCCavernCrawlRequestMapStateResponse_MapVariant[];
}
export declare enum CMsgClientToGCCavernCrawlRequestMapStateResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    EVENT_NOT_OWNED = 2
}
export declare function cMsgClientToGCCavernCrawlRequestMapStateResponse_ResultFromJSON(object: any): CMsgClientToGCCavernCrawlRequestMapStateResponse_Result;
export declare function cMsgClientToGCCavernCrawlRequestMapStateResponse_ResultToJSON(object: CMsgClientToGCCavernCrawlRequestMapStateResponse_Result): string;
export interface CMsgClientToGCCavernCrawlRequestMapStateResponse_SwappedChallenge {
    pathId1: number;
    pathId2: number;
}
export interface CMsgClientToGCCavernCrawlRequestMapStateResponse_InventoryItem {
    itemType: number;
    count: number;
}
export interface CMsgClientToGCCavernCrawlRequestMapStateResponse_TreasureMap {
    mapRoomId: number;
    revealedRoomId: number;
}
export interface CMsgClientToGCCavernCrawlRequestMapStateResponse_MapVariant {
    mapVariant: number;
    claimedRooms1: string;
    claimedRooms2: string;
    revealedRooms1: string;
    revealedRooms2: string;
    completedPaths1: string;
    completedPaths2: string;
    completedPaths3: string;
    completedPaths4: string;
    halfCompletedPaths1: string;
    halfCompletedPaths2: string;
    halfCompletedPaths3: string;
    halfCompletedPaths4: string;
    swappedChallenge: CMsgClientToGCCavernCrawlRequestMapStateResponse_SwappedChallenge[];
    ultraRareRewardRoomNumber: number;
    treasureMap: CMsgClientToGCCavernCrawlRequestMapStateResponse_TreasureMap[];
}
export interface CMsgClientToGCCavernCrawlGetClaimedRoomCount {
    eventId: number;
}
export interface CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse {
    result: CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_Result;
    mapVariants: CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_MapVariant[];
    availableMapVariantsMask: number;
}
export declare enum CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_Result {
    SUCCESS = 0,
    ERROR_UNKNOWN = 1,
    EVENT_NOT_OWNED = 2
}
export declare function cMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_ResultFromJSON(object: any): CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_Result;
export declare function cMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_ResultToJSON(object: CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_Result): string;
export interface CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_MapVariant {
    mapVariant: number;
    count: number;
}
export interface CMsgDOTAMutationList {
    mutations: CMsgDOTAMutationList_Mutation[];
}
export interface CMsgDOTAMutationList_Mutation {
    id: number;
    name: string;
    description: string;
}
export interface CMsgEventTipsSummaryRequest {
    eventId: EEvent;
    accountId: number;
}
export interface CMsgEventTipsSummaryResponse {
    result: boolean;
    tipsReceived: CMsgEventTipsSummaryResponse_Tipper[];
}
export interface CMsgEventTipsSummaryResponse_Tipper {
    tipperAccountId: number;
    tipCount: number;
}
export interface CMsgSocialFeedRequest {
    accountId: number;
    selfOnly: boolean;
}
export interface CMsgSocialFeedResponse {
    result: CMsgSocialFeedResponse_Result;
    feedEvents: CMsgSocialFeedResponse_FeedEvent[];
}
export declare enum CMsgSocialFeedResponse_Result {
    SUCCESS = 0,
    FAILED_TO_LOAD_FRIENDS = 1,
    FAILED_TO_LOAD_FEED_DATA = 2,
    FAILED_TO_LOAD_FEED_ENTRY = 3,
    FAILED_TO_LOAD_COMMENTS = 4,
    FAILED_TOO_MANY_REQUESTS = 5
}
export declare function cMsgSocialFeedResponse_ResultFromJSON(object: any): CMsgSocialFeedResponse_Result;
export declare function cMsgSocialFeedResponse_ResultToJSON(object: CMsgSocialFeedResponse_Result): string;
export interface CMsgSocialFeedResponse_FeedEvent {
    feedEventId: string;
    accountId: number;
    timestamp: number;
    commentCount: number;
    eventType: number;
    eventSubType: number;
    paramBigInt1: string;
    paramInt1: number;
    paramInt2: number;
    paramInt3: number;
    paramString: string;
}
export interface CMsgSocialFeedCommentsRequest {
    feedEventId: string;
}
export interface CMsgSocialFeedCommentsResponse {
    result: CMsgSocialFeedCommentsResponse_Result;
    feedComments: CMsgSocialFeedCommentsResponse_FeedComment[];
}
export declare enum CMsgSocialFeedCommentsResponse_Result {
    SUCCESS = 0,
    FAILED_TOO_MANY_REQUESTS = 1,
    FAILED_TO_LOAD_COMMENTS = 2
}
export declare function cMsgSocialFeedCommentsResponse_ResultFromJSON(object: any): CMsgSocialFeedCommentsResponse_Result;
export declare function cMsgSocialFeedCommentsResponse_ResultToJSON(object: CMsgSocialFeedCommentsResponse_Result): string;
export interface CMsgSocialFeedCommentsResponse_FeedComment {
    commenterAccountId: number;
    timestamp: number;
    commentText: string;
}
export interface CMsgClientToGCPlayerCardSpecificPurchaseRequest {
    playerAccountId: number;
    eventId: number;
    cardDustItemId: string;
}
export interface CMsgClientToGCPlayerCardSpecificPurchaseResponse {
    result: CMsgClientToGCPlayerCardSpecificPurchaseResponse_Result;
    itemId: string;
}
export declare enum CMsgClientToGCPlayerCardSpecificPurchaseResponse_Result {
    SUCCESS = 1,
    ERROR_INTERNAL = 2,
    ERROR_INSUFFICIENT_DUST = 3,
    ERROR_ITEM_NOT_DUST_ITEM = 4,
    ERROR_FAILED_CARD_PACK_CREATE = 5,
    ERROR_NOT_AVAILABLE = 6
}
export declare function cMsgClientToGCPlayerCardSpecificPurchaseResponse_ResultFromJSON(object: any): CMsgClientToGCPlayerCardSpecificPurchaseResponse_Result;
export declare function cMsgClientToGCPlayerCardSpecificPurchaseResponse_ResultToJSON(object: CMsgClientToGCPlayerCardSpecificPurchaseResponse_Result): string;
export interface CMsgClientToGCRequestContestVotes {
    contestId: number;
}
export interface CMsgClientToGCRequestContestVotesResponse {
    result: CMsgClientToGCRequestContestVotesResponse_EResponse;
    votes: CMsgClientToGCRequestContestVotesResponse_ItemVote[];
}
export declare enum CMsgClientToGCRequestContestVotesResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3
}
export declare function cMsgClientToGCRequestContestVotesResponse_EResponseFromJSON(object: any): CMsgClientToGCRequestContestVotesResponse_EResponse;
export declare function cMsgClientToGCRequestContestVotesResponse_EResponseToJSON(object: CMsgClientToGCRequestContestVotesResponse_EResponse): string;
export interface CMsgClientToGCRequestContestVotesResponse_ItemVote {
    contestItemId: string;
    vote: number;
}
export interface CMsgClientToGCRecordContestVote {
    contestId: number;
    contestItemId: string;
    vote: number;
}
export interface CMsgGCToClientRecordContestVoteResponse {
    eresult: CMsgGCToClientRecordContestVoteResponse_EResult;
}
export declare enum CMsgGCToClientRecordContestVoteResponse_EResult {
    SUCCESS = 0,
    FAILED_EVENT_NOT_OWNED = 1,
    FAILED_SQL_INSERT_FAILED = 2,
    FAILED_INVALID_CONTEST = 3,
    FAILED_CONTEST_NOT_ACTIVE = 4,
    FAILED_TIMEOUT = 5
}
export declare function cMsgGCToClientRecordContestVoteResponse_EResultFromJSON(object: any): CMsgGCToClientRecordContestVoteResponse_EResult;
export declare function cMsgGCToClientRecordContestVoteResponse_EResultToJSON(object: CMsgGCToClientRecordContestVoteResponse_EResult): string;
export interface CMsgDevGrantEventPoints {
    eventId: EEvent;
    eventPoints: number;
    premiumPoints: number;
}
export interface CMsgDevGrantEventPointsResponse {
    result: EDevEventRequestResult;
}
export interface CMsgDevGrantEventAction {
    eventId: EEvent;
    actionId: number;
    actionScore: number;
}
export interface CMsgDevGrantEventActionResponse {
    result: EDevEventRequestResult;
}
export interface CMsgDevDeleteEventActions {
    eventId: EEvent;
    startActionId: number;
    endActionId: number;
    removeAudit: boolean;
}
export interface CMsgDevDeleteEventActionsResponse {
    result: EDevEventRequestResult;
}
export interface CMsgDevResetEventState {
    eventId: EEvent;
    removeAudit: boolean;
}
export interface CMsgDevResetEventStateResponse {
    result: EDevEventRequestResult;
}
export interface CMsgConsumeEventSupportGrantItem {
    itemId: string;
}
export interface CMsgConsumeEventSupportGrantItemResponse {
    result: ESupportEventRequestResult;
}
export interface CMsgClientToGCGetFilteredPlayers {
}
export interface CMsgGCToClientGetFilteredPlayersResponse {
    result: CMsgGCToClientGetFilteredPlayersResponse_Result;
    filteredPlayers: CMsgGCToClientGetFilteredPlayersResponse_CFilterEntry[];
    baseSlots: number;
    additionalSlots: number;
    nextSlotCost: number;
}
export declare enum CMsgGCToClientGetFilteredPlayersResponse_Result {
    SUCCESS = 0,
    FAILURE = 1
}
export declare function cMsgGCToClientGetFilteredPlayersResponse_ResultFromJSON(object: any): CMsgGCToClientGetFilteredPlayersResponse_Result;
export declare function cMsgGCToClientGetFilteredPlayersResponse_ResultToJSON(object: CMsgGCToClientGetFilteredPlayersResponse_Result): string;
export interface CMsgGCToClientGetFilteredPlayersResponse_CFilterEntry {
    accountId: number;
    timeAdded: number;
    timeExpires: number;
    note: string;
}
export interface CMsgClientToGCRemoveFilteredPlayer {
    accountIdToRemove: number;
}
export interface CMsgGCToClientRemoveFilteredPlayerResponse {
    result: CMsgGCToClientRemoveFilteredPlayerResponse_Result;
}
export declare enum CMsgGCToClientRemoveFilteredPlayerResponse_Result {
    SUCCESS = 0,
    FAILURE = 1
}
export declare function cMsgGCToClientRemoveFilteredPlayerResponse_ResultFromJSON(object: any): CMsgGCToClientRemoveFilteredPlayerResponse_Result;
export declare function cMsgGCToClientRemoveFilteredPlayerResponse_ResultToJSON(object: CMsgGCToClientRemoveFilteredPlayerResponse_Result): string;
export interface CMsgClientToGCPurchaseFilteredPlayerSlot {
    additionalSlotsCurrent: number;
}
export interface CMsgGCToClientPurchaseFilteredPlayerSlotResponse {
    result: CMsgGCToClientPurchaseFilteredPlayerSlotResponse_Result;
    additionalSlots: number;
    nextSlotCost: number;
}
export declare enum CMsgGCToClientPurchaseFilteredPlayerSlotResponse_Result {
    SUCCESS = 0,
    FAILURE = 1,
    CURRENT_SLOTCOUNT_DOESNT_MATCH = 2,
    CANT_AFFORD = 3
}
export declare function cMsgGCToClientPurchaseFilteredPlayerSlotResponse_ResultFromJSON(object: any): CMsgGCToClientPurchaseFilteredPlayerSlotResponse_Result;
export declare function cMsgGCToClientPurchaseFilteredPlayerSlotResponse_ResultToJSON(object: CMsgGCToClientPurchaseFilteredPlayerSlotResponse_Result): string;
export interface CMsgClientToGCUpdateFilteredPlayerNote {
    targetAccountId: number;
    newNote: string;
}
export interface CMsgGCToClientUpdateFilteredPlayerNoteResponse {
    result: CMsgGCToClientUpdateFilteredPlayerNoteResponse_Result;
}
export declare enum CMsgGCToClientUpdateFilteredPlayerNoteResponse_Result {
    SUCCESS = 0,
    FAILURE = 1,
    NOT_FOUND = 2
}
export declare function cMsgGCToClientUpdateFilteredPlayerNoteResponse_ResultFromJSON(object: any): CMsgGCToClientUpdateFilteredPlayerNoteResponse_Result;
export declare function cMsgGCToClientUpdateFilteredPlayerNoteResponse_ResultToJSON(object: CMsgGCToClientUpdateFilteredPlayerNoteResponse_Result): string;
export interface CMsgPartySearchPlayer {
    accountId: number;
    matchId: string;
    creationTime: number;
}
export interface CMsgGCToClientPlayerBeaconState {
    numActiveBeacons: number[];
}
export interface CMsgGCToClientPartyBeaconUpdate {
    beaconAdded: boolean;
    beaconType: number;
    accountId: number;
}
export interface CMsgClientToGCUpdatePartyBeacon {
    action: CMsgClientToGCUpdatePartyBeacon_Action;
}
export declare enum CMsgClientToGCUpdatePartyBeacon_Action {
    ON = 0,
    OFF = 1
}
export declare function cMsgClientToGCUpdatePartyBeacon_ActionFromJSON(object: any): CMsgClientToGCUpdatePartyBeacon_Action;
export declare function cMsgClientToGCUpdatePartyBeacon_ActionToJSON(object: CMsgClientToGCUpdatePartyBeacon_Action): string;
export interface CMsgClientToGCRequestActiveBeaconParties {
}
export interface CMsgGCToClientRequestActiveBeaconPartiesResponse {
    response: CMsgGCToClientRequestActiveBeaconPartiesResponse_EResponse;
    activeParties: CPartySearchClientParty[];
}
export declare enum CMsgGCToClientRequestActiveBeaconPartiesResponse_EResponse {
    SUCCESS = 0,
    FAILURE = 1,
    BUSY = 2
}
export declare function cMsgGCToClientRequestActiveBeaconPartiesResponse_EResponseFromJSON(object: any): CMsgGCToClientRequestActiveBeaconPartiesResponse_EResponse;
export declare function cMsgGCToClientRequestActiveBeaconPartiesResponse_EResponseToJSON(object: CMsgGCToClientRequestActiveBeaconPartiesResponse_EResponse): string;
export interface CMsgClientToGCJoinPartyFromBeacon {
    partyId: string;
    accountId: number;
    beaconType: number;
}
export interface CMsgGCToClientJoinPartyFromBeaconResponse {
    response: CMsgGCToClientJoinPartyFromBeaconResponse_EResponse;
}
export declare enum CMsgGCToClientJoinPartyFromBeaconResponse_EResponse {
    SUCCESS = 0,
    FAILURE = 1,
    BUSY = 2,
    NOT_LEADER = 3
}
export declare function cMsgGCToClientJoinPartyFromBeaconResponse_EResponseFromJSON(object: any): CMsgGCToClientJoinPartyFromBeaconResponse_EResponse;
export declare function cMsgGCToClientJoinPartyFromBeaconResponse_EResponseToJSON(object: CMsgGCToClientJoinPartyFromBeaconResponse_EResponse): string;
export interface CMsgClientToGCManageFavorites {
    action: CMsgClientToGCManageFavorites_Action;
    accountId: number;
    favoriteName: string;
    inviteResponse: boolean;
    fromFriendlist: boolean;
    lobbyId: string;
}
export declare enum CMsgClientToGCManageFavorites_Action {
    ADD = 0,
    REMOVE = 1
}
export declare function cMsgClientToGCManageFavorites_ActionFromJSON(object: any): CMsgClientToGCManageFavorites_Action;
export declare function cMsgClientToGCManageFavorites_ActionToJSON(object: CMsgClientToGCManageFavorites_Action): string;
export interface CMsgGCToClientManageFavoritesResponse {
    response: CMsgGCToClientManageFavoritesResponse_EResponse;
    debugMessage: string;
    player: CMsgPartySearchPlayer | undefined;
}
export declare enum CMsgGCToClientManageFavoritesResponse_EResponse {
    SUCCESS = 0,
    FAILURE = 1,
    NO_INVITE_PRESENT = 2,
    INVITE_SENT = 3,
    EXPIRED = 4,
    BUSY = 5
}
export declare function cMsgGCToClientManageFavoritesResponse_EResponseFromJSON(object: any): CMsgGCToClientManageFavoritesResponse_EResponse;
export declare function cMsgGCToClientManageFavoritesResponse_EResponseToJSON(object: CMsgGCToClientManageFavoritesResponse_EResponse): string;
export interface CMsgClientToGCGetFavoritePlayers {
    paginationKey: string;
    paginationCount: number;
}
export interface CMsgGCToClientGetFavoritePlayersResponse {
    response: CMsgGCToClientGetFavoritePlayersResponse_EResponse;
    players: CMsgPartySearchPlayer[];
    nextPaginationKey: string;
}
export declare enum CMsgGCToClientGetFavoritePlayersResponse_EResponse {
    SUCCESS = 0,
    FAILURE = 1
}
export declare function cMsgGCToClientGetFavoritePlayersResponse_EResponseFromJSON(object: any): CMsgGCToClientGetFavoritePlayersResponse_EResponse;
export declare function cMsgGCToClientGetFavoritePlayersResponse_EResponseToJSON(object: CMsgGCToClientGetFavoritePlayersResponse_EResponse): string;
export interface CMsgGCToClientPartySearchInvite {
    accountId: number;
}
export interface CMsgClientToGCVerifyFavoritePlayers {
    accountIds: number[];
}
export interface CMsgGCToClientVerifyFavoritePlayersResponse {
    results: CMsgGCToClientVerifyFavoritePlayersResponse_Result[];
}
export interface CMsgGCToClientVerifyFavoritePlayersResponse_Result {
    player: CMsgPartySearchPlayer | undefined;
    isFavorite: boolean;
}
export interface CMsgClientToGCRequestPlayerRecentAccomplishments {
    accountId: number;
}
export interface CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse {
    result: CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponse;
    playerAccomplishments: CMsgPlayerRecentAccomplishments | undefined;
}
export declare enum CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3
}
export declare function cMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponseFromJSON(object: any): CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponse;
export declare function cMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponseToJSON(object: CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse_EResponse): string;
export interface CMsgClientToGCRequestPlayerHeroRecentAccomplishments {
    accountId: number;
    heroId: number;
}
export interface CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse {
    result: CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponse;
    heroAccomplishments: CMsgPlayerHeroRecentAccomplishments | undefined;
}
export declare enum CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3
}
export declare function cMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponseFromJSON(object: any): CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponse;
export declare function cMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponseToJSON(object: CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse_EResponse): string;
export interface CMsgClientToGCSubmitPlayerMatchSurvey {
    matchId: string;
    rating: number;
    flags: number;
}
export interface CMsgClientToGCSubmitPlayerMatchSurveyResponse {
    eresult: CMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponse;
    accountId: number;
}
export declare enum CMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eAlreadySubmitted = 4,
    k_ePlayerNotValid = 5
}
export declare function cMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponseFromJSON(object: any): CMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponse;
export declare function cMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponseToJSON(object: CMsgClientToGCSubmitPlayerMatchSurveyResponse_EResponse): string;
export interface CMsgGCToClientVACReminder {
}
export interface CMsgClientToGCUnderDraftRequest {
    accountId: number;
    eventId: number;
}
export interface CMsgClientToGCUnderDraftResponse {
    result: EUnderDraftResponse;
    accountId: number;
    eventId: number;
    draftData: CMsgUnderDraftData | undefined;
}
export interface CMsgClientToGCUnderDraftReroll {
    eventId: number;
}
export interface CMsgClientToGCUnderDraftRerollResponse {
    result: EUnderDraftResponse;
    eventId: number;
    draftData: CMsgUnderDraftData | undefined;
}
export interface CMsgClientToGCUnderDraftBuy {
    eventId: number;
    slotId: number;
}
export interface CMsgGCToClientGuildUnderDraftGoldUpdated {
    eventId: number;
}
export interface CMsgClientToGCUnderDraftBuyResponse {
    result: EUnderDraftResponse;
    eventId: number;
    slotId: number;
    draftData: CMsgUnderDraftData | undefined;
}
export interface CMsgClientToGCUnderDraftRollBackBench {
    eventId: number;
}
export interface CMsgClientToGCUnderDraftRollBackBenchResponse {
    result: EUnderDraftResponse;
    eventId: number;
    draftData: CMsgUnderDraftData | undefined;
}
export interface CMsgClientToGCUnderDraftSell {
    eventId: number;
    slotId: number;
}
export interface CMsgClientToGCUnderDraftSellResponse {
    result: EUnderDraftResponse;
    eventId: number;
    slotId: number;
    draftData: CMsgUnderDraftData | undefined;
}
export interface CMsgClientToGCUnderDraftRedeemReward {
    eventId: number;
    actionId: number;
}
export interface CMsgClientToGCUnderDraftRedeemRewardResponse {
    result: EUnderDraftResponse;
}
export interface CMsgClientToGCSubmitDraftTriviaMatchAnswer {
    choseRadiantAsWinner: boolean;
    eventId: number;
    endTime: number;
}
export interface CMsgClientToGCSubmitDraftTriviaMatchAnswerResponse {
    result: EDOTADraftTriviaAnswerResult;
}
export interface CMsgDraftTriviaVoteCount {
    totalVotes: number;
    radiantVotes: number;
    direVotes: number;
}
export interface CMsgClientToGCRequestReporterUpdates {
}
export interface CMsgClientToGCRequestReporterUpdatesResponse {
    enumResult: CMsgClientToGCRequestReporterUpdatesResponse_EResponse;
    updates: CMsgClientToGCRequestReporterUpdatesResponse_ReporterUpdate[];
    numReported: number;
    numNoActionTaken: number;
}
export declare enum CMsgClientToGCRequestReporterUpdatesResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 3,
    k_eNotPermitted = 4,
    k_eNotToSoon = 5,
    k_eNotValid = 6
}
export declare function cMsgClientToGCRequestReporterUpdatesResponse_EResponseFromJSON(object: any): CMsgClientToGCRequestReporterUpdatesResponse_EResponse;
export declare function cMsgClientToGCRequestReporterUpdatesResponse_EResponseToJSON(object: CMsgClientToGCRequestReporterUpdatesResponse_EResponse): string;
export interface CMsgClientToGCRequestReporterUpdatesResponse_ReporterUpdate {
    matchId: string;
    heroId: number;
    reportReason: number;
    timestamp: number;
}
export interface CMsgClientToGCAcknowledgeReporterUpdates {
    matchIds: string[];
}
export interface CMsgClientToGCRecalibrateMMR {
}
export interface CMsgClientToGCRecalibrateMMRResponse {
    result: CMsgClientToGCRecalibrateMMRResponse_EResponse;
}
export declare enum CMsgClientToGCRecalibrateMMRResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 3,
    k_eNotPermitted = 4,
    k_eNotToSoon = 5,
    k_eNotValid = 6
}
export declare function cMsgClientToGCRecalibrateMMRResponse_EResponseFromJSON(object: any): CMsgClientToGCRecalibrateMMRResponse_EResponse;
export declare function cMsgClientToGCRecalibrateMMRResponse_EResponseToJSON(object: CMsgClientToGCRecalibrateMMRResponse_EResponse): string;
export interface CMsgDOTAPostGameItemAwardNotification {
    receiverAccountId: number;
    itemDefIndex: number[];
    actionId: number;
}
export interface CMsgClientToGCGetOWMatchDetails {
}
export interface CMsgClientToGCGetOWMatchDetailsResponse {
    result: CMsgClientToGCGetOWMatchDetailsResponse_EResponse;
    overwatchReplayId: string;
    decryptionKey: string;
    cluster: number;
    overwatchSalt: number;
    targetPlayerSlot: number;
    markers: CMsgClientToGCGetOWMatchDetailsResponse_Marker[];
    reportReason: EOverwatchReportReason;
    targetHeroId: number;
    rankTier: number;
    laneSelectionFlags: number;
}
export declare enum CMsgClientToGCGetOWMatchDetailsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 3,
    k_eNotPermitted = 4,
    k_eNoCaseAvailable = 5
}
export declare function cMsgClientToGCGetOWMatchDetailsResponse_EResponseFromJSON(object: any): CMsgClientToGCGetOWMatchDetailsResponse_EResponse;
export declare function cMsgClientToGCGetOWMatchDetailsResponse_EResponseToJSON(object: CMsgClientToGCGetOWMatchDetailsResponse_EResponse): string;
export interface CMsgClientToGCGetOWMatchDetailsResponse_Marker {
    startGameTimeS: number;
    endGameTimeS: number;
}
export interface CMsgClientToGCSubmitOWConviction {
    overwatchReplayId: string;
    targetPlayerSlot: number;
    cheatingConviction: EOverwatchConviction;
    griefingConviction: EOverwatchConviction;
}
export interface CMsgClientToGCSubmitOWConvictionResponse {
    result: CMsgClientToGCSubmitOWConvictionResponse_EResponse;
    overwatchReplayId: string;
}
export declare enum CMsgClientToGCSubmitOWConvictionResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 3,
    k_eNotPermitted = 4,
    k_eInvalidReplayID = 5,
    k_eInvalidConviction = 6,
    k_eInvalidPlayerSlot = 7
}
export declare function cMsgClientToGCSubmitOWConvictionResponse_EResponseFromJSON(object: any): CMsgClientToGCSubmitOWConvictionResponse_EResponse;
export declare function cMsgClientToGCSubmitOWConvictionResponse_EResponseToJSON(object: CMsgClientToGCSubmitOWConvictionResponse_EResponse): string;
export interface CMsgClientToGCChinaSSAURLRequest {
}
export interface CMsgClientToGCChinaSSAURLResponse {
    agreementUrl: string;
}
export interface CMsgClientToGCChinaSSAAcceptedRequest {
}
export interface CMsgClientToGCChinaSSAAcceptedResponse {
    agreementAccepted: boolean;
}
export interface CMsgGCToClientOverwatchCasesAvailable {
    expireTime: number;
}
export interface CMsgClientToGCStartWatchingOverwatch {
    overwatchReplayId: string;
    targetPlayerSlot: number;
}
export interface CMsgClientToGCStopWatchingOverwatch {
    overwatchReplayId: string;
    targetPlayerSlot: number;
}
export interface CMsgClientToGCOverwatchReplayError {
    overwatchReplayId: string;
}
export interface CMsgClientToGCGetDPCFavorites {
}
export interface CMsgClientToGCGetDPCFavoritesResponse {
    result: CMsgClientToGCGetDPCFavoritesResponse_EResponse;
    favorites: CMsgClientToGCGetDPCFavoritesResponse_Favorite[];
}
export declare enum CMsgClientToGCGetDPCFavoritesResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidRequest = 5
}
export declare function cMsgClientToGCGetDPCFavoritesResponse_EResponseFromJSON(object: any): CMsgClientToGCGetDPCFavoritesResponse_EResponse;
export declare function cMsgClientToGCGetDPCFavoritesResponse_EResponseToJSON(object: CMsgClientToGCGetDPCFavoritesResponse_EResponse): string;
export interface CMsgClientToGCGetDPCFavoritesResponse_Favorite {
    favoriteType: EDPCFavoriteType;
    favoriteId: number;
}
export interface CMsgClientToGCSetDPCFavoriteState {
    favoriteType: EDPCFavoriteType;
    favoriteId: number;
    enabled: boolean;
}
export interface CMsgClientToGCSetDPCFavoriteStateResponse {
    result: CMsgClientToGCSetDPCFavoriteStateResponse_EResponse;
}
export declare enum CMsgClientToGCSetDPCFavoriteStateResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eFavoriteTypeOutOfRange = 2,
    k_eLockFailed = 3,
    k_eAlreadyFavorited = 4,
    k_eAlreadyUnfavorited = 5,
    k_eInsertRecordFailed = 6,
    k_eRemoveRecordFailed = 7,
    k_eTimeout = 8
}
export declare function cMsgClientToGCSetDPCFavoriteStateResponse_EResponseFromJSON(object: any): CMsgClientToGCSetDPCFavoriteStateResponse_EResponse;
export declare function cMsgClientToGCSetDPCFavoriteStateResponse_EResponseToJSON(object: CMsgClientToGCSetDPCFavoriteStateResponse_EResponse): string;
export interface CMsgClientToGCSetEventActiveSeasonID {
    eventId: number;
    activeSeasonId: number;
}
export interface CMsgClientToGCSetEventActiveSeasonIDResponse {
    result: CMsgClientToGCSetEventActiveSeasonIDResponse_EResponse;
}
export declare enum CMsgClientToGCSetEventActiveSeasonIDResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eDisabled = 2,
    k_eTooBusy = 3,
    k_eNotAllowed = 4,
    k_eTimeout = 5,
    k_eInternalSuccessNoChange = 6
}
export declare function cMsgClientToGCSetEventActiveSeasonIDResponse_EResponseFromJSON(object: any): CMsgClientToGCSetEventActiveSeasonIDResponse_EResponse;
export declare function cMsgClientToGCSetEventActiveSeasonIDResponse_EResponseToJSON(object: CMsgClientToGCSetEventActiveSeasonIDResponse_EResponse): string;
export interface CMsgClientToGCPurchaseLabyrinthBlessings {
    eventId: EEvent;
    blessingIds: number[];
    debug: boolean;
    debugRemove: boolean;
}
export interface CMsgClientToGCPurchaseLabyrinthBlessingsResponse {
    result: CMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponse;
}
export declare enum CMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eNoSuchBlessing = 2,
    k_eNotEnoughShards = 3,
    k_eNoPath = 4,
    k_eTimeout = 5
}
export declare function cMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponseFromJSON(object: any): CMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponse;
export declare function cMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponseToJSON(object: CMsgClientToGCPurchaseLabyrinthBlessingsResponse_EResponse): string;
export interface CMsgClientToGCGetStickerbookRequest {
    accountId: number;
}
export interface CMsgClientToGCGetStickerbookResponse {
    response: CMsgClientToGCGetStickerbookResponse_EResponse;
    stickerbook: CMsgStickerbook | undefined;
}
export declare enum CMsgClientToGCGetStickerbookResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eNotAllowed = 3,
    k_eTooBusy = 4
}
export declare function cMsgClientToGCGetStickerbookResponse_EResponseFromJSON(object: any): CMsgClientToGCGetStickerbookResponse_EResponse;
export declare function cMsgClientToGCGetStickerbookResponse_EResponseToJSON(object: CMsgClientToGCGetStickerbookResponse_EResponse): string;
export interface CMsgClientToGCCreateStickerbookPageRequest {
    teamId: number;
    eventId: EEvent;
    pageType: EStickerbookPageType;
}
export interface CMsgClientToGCCreateStickerbookPageResponse {
    response: CMsgClientToGCCreateStickerbookPageResponse_EResponse;
    pageNumber: number;
}
export declare enum CMsgClientToGCCreateStickerbookPageResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooManyPages = 3,
    k_eTooBusy = 4
}
export declare function cMsgClientToGCCreateStickerbookPageResponse_EResponseFromJSON(object: any): CMsgClientToGCCreateStickerbookPageResponse_EResponse;
export declare function cMsgClientToGCCreateStickerbookPageResponse_EResponseToJSON(object: CMsgClientToGCCreateStickerbookPageResponse_EResponse): string;
export interface CMsgClientToGCDeleteStickerbookPageRequest {
    pageNum: number;
    stickerCount: number;
    stickerMax: number;
}
export interface CMsgClientToGCDeleteStickerbookPageResponse {
    response: CMsgClientToGCDeleteStickerbookPageResponse_EResponse;
}
export declare enum CMsgClientToGCDeleteStickerbookPageResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eInvalidStickerCount = 3,
    k_eTooBusy = 4,
    k_eInvalidStickerMax = 5,
    k_eInvalidPage = 6
}
export declare function cMsgClientToGCDeleteStickerbookPageResponse_EResponseFromJSON(object: any): CMsgClientToGCDeleteStickerbookPageResponse_EResponse;
export declare function cMsgClientToGCDeleteStickerbookPageResponse_EResponseToJSON(object: CMsgClientToGCDeleteStickerbookPageResponse_EResponse): string;
export interface CMsgClientToGCPlaceStickersRequest {
    stickerItems: CMsgClientToGCPlaceStickersRequest_StickerItem[];
}
export interface CMsgClientToGCPlaceStickersRequest_StickerItem {
    pageNum: number;
    sticker: CMsgStickerbookSticker | undefined;
}
export interface CMsgClientToGCPlaceStickersResponse {
    response: CMsgClientToGCPlaceStickersResponse_EResponse;
}
export declare enum CMsgClientToGCPlaceStickersResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eMissingItem = 3,
    k_eTooBusy = 4,
    k_eDuplicateItem = 5,
    k_eInvalidPage = 6,
    k_ePageTypeMismatch = 7,
    k_eTooManyStickers = 8
}
export declare function cMsgClientToGCPlaceStickersResponse_EResponseFromJSON(object: any): CMsgClientToGCPlaceStickersResponse_EResponse;
export declare function cMsgClientToGCPlaceStickersResponse_EResponseToJSON(object: CMsgClientToGCPlaceStickersResponse_EResponse): string;
export interface CMsgClientToGCPlaceCollectionStickersRequest {
    slots: CMsgClientToGCPlaceCollectionStickersRequest_Slot[];
}
export interface CMsgClientToGCPlaceCollectionStickersRequest_Slot {
    pageNum: number;
    slot: number;
    newItemId: string;
    oldItemDefId: number;
    oldQuality: number;
}
export interface CMsgClientToGCPlaceCollectionStickersResponse {
    response: CMsgClientToGCPlaceCollectionStickersResponse_EResponse;
}
export declare enum CMsgClientToGCPlaceCollectionStickersResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eMissingItem = 3,
    k_eTooBusy = 4,
    k_eDuplicateItem = 5,
    k_eInvalidPage = 6,
    k_ePageTypeMismatch = 7,
    k_eOldItemMismatch = 8,
    k_eInvalidSlot = 9,
    k_eSlotTypeMismatch = 10
}
export declare function cMsgClientToGCPlaceCollectionStickersResponse_EResponseFromJSON(object: any): CMsgClientToGCPlaceCollectionStickersResponse_EResponse;
export declare function cMsgClientToGCPlaceCollectionStickersResponse_EResponseToJSON(object: CMsgClientToGCPlaceCollectionStickersResponse_EResponse): string;
export interface CMsgClientToGCOrderStickerbookTeamPageRequest {
    pageOrderSequence: CMsgStickerbookTeamPageOrderSequence | undefined;
}
export interface CMsgClientToGCOrderStickerbookTeamPageResponse {
    response: CMsgClientToGCOrderStickerbookTeamPageResponse_EResponse;
}
export declare enum CMsgClientToGCOrderStickerbookTeamPageResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooManyPages = 3,
    k_eTooBusy = 4,
    k_eInvalidPage = 5
}
export declare function cMsgClientToGCOrderStickerbookTeamPageResponse_EResponseFromJSON(object: any): CMsgClientToGCOrderStickerbookTeamPageResponse_EResponse;
export declare function cMsgClientToGCOrderStickerbookTeamPageResponse_EResponseToJSON(object: CMsgClientToGCOrderStickerbookTeamPageResponse_EResponse): string;
export interface CMsgClientToGCSetHeroSticker {
    heroId: number;
    newItemId: string;
    oldItemId: string;
}
export interface CMsgClientToGCSetHeroStickerResponse {
    response: CMsgClientToGCSetHeroStickerResponse_EResponse;
}
export declare enum CMsgClientToGCSetHeroStickerResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eMissingItem = 3,
    k_eTooBusy = 4,
    k_eOldItemMismatch = 5,
    k_eInvalidHero = 6
}
export declare function cMsgClientToGCSetHeroStickerResponse_EResponseFromJSON(object: any): CMsgClientToGCSetHeroStickerResponse_EResponse;
export declare function cMsgClientToGCSetHeroStickerResponse_EResponseToJSON(object: CMsgClientToGCSetHeroStickerResponse_EResponse): string;
export interface CMsgClientToGCGetHeroStickers {
}
export interface CMsgClientToGCGetHeroStickersResponse {
    response: CMsgClientToGCGetHeroStickersResponse_EResponse;
    stickerHeroes: CMsgStickerHeroes | undefined;
}
export declare enum CMsgClientToGCGetHeroStickersResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 4
}
export declare function cMsgClientToGCGetHeroStickersResponse_EResponseFromJSON(object: any): CMsgClientToGCGetHeroStickersResponse_EResponse;
export declare function cMsgClientToGCGetHeroStickersResponse_EResponseToJSON(object: CMsgClientToGCGetHeroStickersResponse_EResponse): string;
export interface CMsgClientToGCSetFavoritePage {
    pageNum: number;
    clear: boolean;
}
export interface CMsgClientToGCSetFavoritePageResponse {
    response: CMsgClientToGCSetFavoritePageResponse_EResponse;
}
export declare enum CMsgClientToGCSetFavoritePageResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 4,
    k_eInvalidPage = 5
}
export declare function cMsgClientToGCSetFavoritePageResponse_EResponseFromJSON(object: any): CMsgClientToGCSetFavoritePageResponse_EResponse;
export declare function cMsgClientToGCSetFavoritePageResponse_EResponseToJSON(object: CMsgClientToGCSetFavoritePageResponse_EResponse): string;
export interface CMsgClientToGCClaimSwag {
    eventId: EEvent;
    actionId: number;
    data: number;
}
export interface CMsgClientToGCClaimSwagResponse {
    response: CMsgClientToGCClaimSwagResponse_EResponse;
}
export declare enum CMsgClientToGCClaimSwagResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 4,
    k_eAlreadyClaimed = 5,
    k_eDisabled = 6,
    k_eInvalidRequest = 7,
    k_eUserNotEligible = 8,
    k_eStorageError = 9,
    k_eRewardDisabled = 10
}
export declare function cMsgClientToGCClaimSwagResponse_EResponseFromJSON(object: any): CMsgClientToGCClaimSwagResponse_EResponse;
export declare function cMsgClientToGCClaimSwagResponse_EResponseToJSON(object: CMsgClientToGCClaimSwagResponse_EResponse): string;
export interface CMsgClientToGCCollectorsCacheAvailableDataRequest {
    contestId: number;
}
export interface CMsgGCToClientCollectorsCacheAvailableDataResponse {
    votes: CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote[];
}
export interface CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote {
    itemDef: number;
    voteType: CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteType;
}
export declare enum CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteType {
    k_eUp = 0,
    k_eDown = 1
}
export declare function cMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteTypeFromJSON(object: any): CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteType;
export declare function cMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteTypeToJSON(object: CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote_EVoteType): string;
export interface CMsgClientToGCUploadMatchClip {
    matchClip: CMatchClip | undefined;
}
export interface CMsgGCToClientUploadMatchClipResponse {
    response: CMsgGCToClientUploadMatchClipResponse_EResponse;
}
export declare enum CMsgGCToClientUploadMatchClipResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTimeout = 2,
    k_eTooBusy = 4
}
export declare function cMsgGCToClientUploadMatchClipResponse_EResponseFromJSON(object: any): CMsgGCToClientUploadMatchClipResponse_EResponse;
export declare function cMsgGCToClientUploadMatchClipResponse_EResponseToJSON(object: CMsgGCToClientUploadMatchClipResponse_EResponse): string;
export interface CMsgClientToGCMapStatsRequest {
}
export interface CMsgGCToClientMapStatsResponse {
    response: CMsgGCToClientMapStatsResponse_EResponse;
    personalStats: CMsgMapStatsSnapshot | undefined;
    globalStats: CMsgGlobalMapStats | undefined;
}
export declare enum CMsgGCToClientMapStatsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1
}
export declare function cMsgGCToClientMapStatsResponse_EResponseFromJSON(object: any): CMsgGCToClientMapStatsResponse_EResponse;
export declare function cMsgGCToClientMapStatsResponse_EResponseToJSON(object: CMsgGCToClientMapStatsResponse_EResponse): string;
export interface CMsgRoadToTIAssignedQuest {
    questId: number;
    difficulty: number;
    progressFlags: number;
    halfCreditFlags: number;
    completed: boolean;
}
export interface CMsgRoadToTIUserData {
    quests: CMsgRoadToTIAssignedQuest[];
}
export interface CMsgClientToGCRoadToTIGetQuests {
    eventId: number;
}
export interface CMsgClientToGCRoadToTIGetQuestsResponse {
    response: CMsgClientToGCRoadToTIGetQuestsResponse_EResponse;
    questData: CMsgRoadToTIUserData | undefined;
}
export declare enum CMsgClientToGCRoadToTIGetQuestsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidID = 5
}
export declare function cMsgClientToGCRoadToTIGetQuestsResponse_EResponseFromJSON(object: any): CMsgClientToGCRoadToTIGetQuestsResponse_EResponse;
export declare function cMsgClientToGCRoadToTIGetQuestsResponse_EResponseToJSON(object: CMsgClientToGCRoadToTIGetQuestsResponse_EResponse): string;
export interface CMsgClientToGCRoadToTIGetActiveQuest {
    eventId: number;
}
export interface CMsgClientToGCRoadToTIGetActiveQuestResponse {
    response: CMsgClientToGCRoadToTIGetActiveQuestResponse_EResponse;
    questData: CMsgRoadToTIAssignedQuest | undefined;
}
export declare enum CMsgClientToGCRoadToTIGetActiveQuestResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eNone = 2,
    k_eTooBusy = 3,
    k_eDisabled = 4,
    k_eTimeout = 5,
    k_eInvalidID = 6
}
export declare function cMsgClientToGCRoadToTIGetActiveQuestResponse_EResponseFromJSON(object: any): CMsgClientToGCRoadToTIGetActiveQuestResponse_EResponse;
export declare function cMsgClientToGCRoadToTIGetActiveQuestResponse_EResponseToJSON(object: CMsgClientToGCRoadToTIGetActiveQuestResponse_EResponse): string;
export interface CMsgGCToClientRoadToTIQuestDataUpdated {
    eventId: number;
    questData: CMsgRoadToTIUserData | undefined;
}
export interface CMsgClientToGCRoadToTIUseItem {
    eventId: number;
    itemType: number;
    heroIndex: number;
}
export interface CMsgClientToGCRoadToTIUseItemResponse {
    response: CMsgClientToGCRoadToTIUseItemResponse_EResponse;
}
export declare enum CMsgClientToGCRoadToTIUseItemResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eBadInput = 2,
    k_eNoItem = 3,
    k_eDisabled = 4,
    k_eTimeout = 5,
    k_eInvalidID = 6
}
export declare function cMsgClientToGCRoadToTIUseItemResponse_EResponseFromJSON(object: any): CMsgClientToGCRoadToTIUseItemResponse_EResponse;
export declare function cMsgClientToGCRoadToTIUseItemResponse_EResponseToJSON(object: CMsgClientToGCRoadToTIUseItemResponse_EResponse): string;
export interface CMsgClientToGCRoadToTIDevForceQuest {
    eventId: number;
    forceMatchType: boolean;
    forceId: number;
}
export interface CMsgLobbyRoadToTIMatchQuestData {
    questData: CMsgRoadToTIAssignedQuest | undefined;
    questPeriod: number;
    questNumber: number;
}
export interface CMsgClientToGCNewBloomGift {
    defindex: number;
    lobbyId: string;
    targetAccountIds: number[];
}
export interface CMsgClientToGCNewBloomGiftResponse {
    result: ENewBloomGiftingResponse;
    receivedAccountIds: number[];
}
export interface CMsgClientToGCSetBannedHeroes {
    bannedHeroIds: number[];
}
export interface CMsgClientToGCUpdateComicBookStats {
    comicId: number;
    stats: CMsgClientToGCUpdateComicBookStats_SingleStat[];
    languageStats: CMsgClientToGCUpdateComicBookStats_LanguageStats | undefined;
}
export interface CMsgClientToGCUpdateComicBookStats_SingleStat {
    statType: CMsgClientToGCUpdateComicBookStatType;
    statValue: number;
}
export interface CMsgClientToGCUpdateComicBookStats_LanguageStats {
    comicId: number;
    clientLanguage: number;
    clientComicLanguage: number;
}
export declare const CMsgClientSuspended: MessageFns<CMsgClientSuspended>;
export declare const CMsgBalancedShuffleLobby: MessageFns<CMsgBalancedShuffleLobby>;
export declare const CMsgInitialQuestionnaireResponse: MessageFns<CMsgInitialQuestionnaireResponse>;
export declare const CMsgDOTARequestMatchesResponse: MessageFns<CMsgDOTARequestMatchesResponse>;
export declare const CMsgDOTARequestMatchesResponse_Series: MessageFns<CMsgDOTARequestMatchesResponse_Series>;
export declare const CMsgDOTAPopup: MessageFns<CMsgDOTAPopup>;
export declare const CMsgDOTAReportsRemainingRequest: MessageFns<CMsgDOTAReportsRemainingRequest>;
export declare const CMsgDOTAReportsRemainingResponse: MessageFns<CMsgDOTAReportsRemainingResponse>;
export declare const CMsgDOTASubmitPlayerReport: MessageFns<CMsgDOTASubmitPlayerReport>;
export declare const CMsgDOTASubmitPlayerReportResponse: MessageFns<CMsgDOTASubmitPlayerReportResponse>;
export declare const CMsgDOTASubmitPlayerAvoidRequest: MessageFns<CMsgDOTASubmitPlayerAvoidRequest>;
export declare const CMsgDOTASubmitPlayerAvoidRequestResponse: MessageFns<CMsgDOTASubmitPlayerAvoidRequestResponse>;
export declare const CMsgDOTASubmitPlayerReportV2: MessageFns<CMsgDOTASubmitPlayerReportV2>;
export declare const CMsgDOTASubmitPlayerReportResponseV2: MessageFns<CMsgDOTASubmitPlayerReportResponseV2>;
export declare const CMsgDOTASubmitLobbyMVPVote: MessageFns<CMsgDOTASubmitLobbyMVPVote>;
export declare const CMsgDOTASubmitLobbyMVPVoteResponse: MessageFns<CMsgDOTASubmitLobbyMVPVoteResponse>;
export declare const CMsgDOTALobbyMVPAwarded: MessageFns<CMsgDOTALobbyMVPAwarded>;
export declare const CMsgDOTAKickedFromMatchmakingQueue: MessageFns<CMsgDOTAKickedFromMatchmakingQueue>;
export declare const CMsgGCMatchDetailsRequest: MessageFns<CMsgGCMatchDetailsRequest>;
export declare const CMsgGCMatchDetailsResponse: MessageFns<CMsgGCMatchDetailsResponse>;
export declare const CMsgDOTAProfileTickets: MessageFns<CMsgDOTAProfileTickets>;
export declare const CMsgDOTAProfileTickets_LeaguePass: MessageFns<CMsgDOTAProfileTickets_LeaguePass>;
export declare const CMsgClientToGCGetProfileTickets: MessageFns<CMsgClientToGCGetProfileTickets>;
export declare const CMsgGCToClientPartySearchInvites: MessageFns<CMsgGCToClientPartySearchInvites>;
export declare const CMsgDOTAWelcome: MessageFns<CMsgDOTAWelcome>;
export declare const CMsgDOTAWelcome_CExtraMsg: MessageFns<CMsgDOTAWelcome_CExtraMsg>;
export declare const CSODOTAGameHeroFavorites: MessageFns<CSODOTAGameHeroFavorites>;
export declare const CMsgDOTAMatchVotes: MessageFns<CMsgDOTAMatchVotes>;
export declare const CMsgDOTAMatchVotes_PlayerVote: MessageFns<CMsgDOTAMatchVotes_PlayerVote>;
export declare const CMsgMatchmakingMatchGroupInfo: MessageFns<CMsgMatchmakingMatchGroupInfo>;
export declare const CMsgDOTAMatchmakingStatsRequest: MessageFns<CMsgDOTAMatchmakingStatsRequest>;
export declare const CMsgDOTAMatchmakingStatsResponse: MessageFns<CMsgDOTAMatchmakingStatsResponse>;
export declare const CMsgDOTAUpdateMatchmakingStats: MessageFns<CMsgDOTAUpdateMatchmakingStats>;
export declare const CMsgDOTAUpdateMatchManagementStats: MessageFns<CMsgDOTAUpdateMatchManagementStats>;
export declare const CMsgDOTASetMatchHistoryAccess: MessageFns<CMsgDOTASetMatchHistoryAccess>;
export declare const CMsgDOTASetMatchHistoryAccessResponse: MessageFns<CMsgDOTASetMatchHistoryAccessResponse>;
export declare const CMsgDOTANotifyAccountFlagsChange: MessageFns<CMsgDOTANotifyAccountFlagsChange>;
export declare const CMsgDOTASetProfilePrivacy: MessageFns<CMsgDOTASetProfilePrivacy>;
export declare const CMsgDOTASetProfilePrivacyResponse: MessageFns<CMsgDOTASetProfilePrivacyResponse>;
export declare const CMsgUpgradeLeagueItem: MessageFns<CMsgUpgradeLeagueItem>;
export declare const CMsgUpgradeLeagueItemResponse: MessageFns<CMsgUpgradeLeagueItemResponse>;
export declare const CMsgGCWatchDownloadedReplay: MessageFns<CMsgGCWatchDownloadedReplay>;
export declare const CMsgClientsRejoinChatChannels: MessageFns<CMsgClientsRejoinChatChannels>;
export declare const CMsgGCGetHeroStandings: MessageFns<CMsgGCGetHeroStandings>;
export declare const CMsgGCGetHeroStandingsResponse: MessageFns<CMsgGCGetHeroStandingsResponse>;
export declare const CMsgGCGetHeroStandingsResponse_Hero: MessageFns<CMsgGCGetHeroStandingsResponse_Hero>;
export declare const CMatchPlayerTimedStatAverages: MessageFns<CMatchPlayerTimedStatAverages>;
export declare const CMatchPlayerTimedStatStdDeviations: MessageFns<CMatchPlayerTimedStatStdDeviations>;
export declare const CMsgGCGetHeroTimedStatsResponse: MessageFns<CMsgGCGetHeroTimedStatsResponse>;
export declare const CMsgGCGetHeroTimedStatsResponse_TimedStatsContainer: MessageFns<CMsgGCGetHeroTimedStatsResponse_TimedStatsContainer>;
export declare const CMsgGCGetHeroTimedStatsResponse_RankChunkedStats: MessageFns<CMsgGCGetHeroTimedStatsResponse_RankChunkedStats>;
export declare const CMsgGCItemEditorReservationsRequest: MessageFns<CMsgGCItemEditorReservationsRequest>;
export declare const CMsgGCItemEditorReservation: MessageFns<CMsgGCItemEditorReservation>;
export declare const CMsgGCItemEditorReservationsResponse: MessageFns<CMsgGCItemEditorReservationsResponse>;
export declare const CMsgGCItemEditorReserveItemDef: MessageFns<CMsgGCItemEditorReserveItemDef>;
export declare const CMsgGCItemEditorReserveItemDefResponse: MessageFns<CMsgGCItemEditorReserveItemDefResponse>;
export declare const CMsgGCItemEditorReleaseReservation: MessageFns<CMsgGCItemEditorReleaseReservation>;
export declare const CMsgGCItemEditorReleaseReservationResponse: MessageFns<CMsgGCItemEditorReleaseReservationResponse>;
export declare const CMsgFlipLobbyTeams: MessageFns<CMsgFlipLobbyTeams>;
export declare const CMsgGCLobbyUpdateBroadcastChannelInfo: MessageFns<CMsgGCLobbyUpdateBroadcastChannelInfo>;
export declare const CMsgDOTAClaimEventActionData: MessageFns<CMsgDOTAClaimEventActionData>;
export declare const CMsgDOTAClaimEventActionData_GrantItemGiftData: MessageFns<CMsgDOTAClaimEventActionData_GrantItemGiftData>;
export declare const CMsgDOTAClaimEventAction: MessageFns<CMsgDOTAClaimEventAction>;
export declare const CMsgClientToGCClaimEventActionUsingItem: MessageFns<CMsgClientToGCClaimEventActionUsingItem>;
export declare const CMsgClientToGCClaimEventActionUsingItemResponse: MessageFns<CMsgClientToGCClaimEventActionUsingItemResponse>;
export declare const CMsgGCToClientClaimEventActionUsingItemCompleted: MessageFns<CMsgGCToClientClaimEventActionUsingItemCompleted>;
export declare const CMsgDOTAGetEventPoints: MessageFns<CMsgDOTAGetEventPoints>;
export declare const CMsgDOTAGetEventPointsResponse: MessageFns<CMsgDOTAGetEventPointsResponse>;
export declare const CMsgDOTAGetEventPointsResponse_Action: MessageFns<CMsgDOTAGetEventPointsResponse_Action>;
export declare const CMsgDOTAGetPeriodicResource: MessageFns<CMsgDOTAGetPeriodicResource>;
export declare const CMsgDOTAGetPeriodicResourceResponse: MessageFns<CMsgDOTAGetPeriodicResourceResponse>;
export declare const CMsgDOTAPeriodicResourceUpdated: MessageFns<CMsgDOTAPeriodicResourceUpdated>;
export declare const CMsgDOTACompendiumSelection: MessageFns<CMsgDOTACompendiumSelection>;
export declare const CMsgDOTACompendiumSelectionResponse: MessageFns<CMsgDOTACompendiumSelectionResponse>;
export declare const CMsgDOTACompendiumRemoveAllSelections: MessageFns<CMsgDOTACompendiumRemoveAllSelections>;
export declare const CMsgDOTACompendiumRemoveAllSelectionsResponse: MessageFns<CMsgDOTACompendiumRemoveAllSelectionsResponse>;
export declare const CMsgDOTACompendiumData: MessageFns<CMsgDOTACompendiumData>;
export declare const CMsgDOTACompendiumDataRequest: MessageFns<CMsgDOTACompendiumDataRequest>;
export declare const CMsgDOTACompendiumDataResponse: MessageFns<CMsgDOTACompendiumDataResponse>;
export declare const CMsgDOTAGetPlayerMatchHistory: MessageFns<CMsgDOTAGetPlayerMatchHistory>;
export declare const CMsgDOTAGetPlayerMatchHistoryResponse: MessageFns<CMsgDOTAGetPlayerMatchHistoryResponse>;
export declare const CMsgDOTAGetPlayerMatchHistoryResponse_Match: MessageFns<CMsgDOTAGetPlayerMatchHistoryResponse_Match>;
export declare const CMsgGCNotificationsRequest: MessageFns<CMsgGCNotificationsRequest>;
export declare const CMsgGCNotificationsNotification: MessageFns<CMsgGCNotificationsNotification>;
export declare const CMsgGCNotificationsUpdate: MessageFns<CMsgGCNotificationsUpdate>;
export declare const CMsgGCNotificationsResponse: MessageFns<CMsgGCNotificationsResponse>;
export declare const CMsgGCNotificationsMarkReadRequest: MessageFns<CMsgGCNotificationsMarkReadRequest>;
export declare const CMsgGCPlayerInfoSubmit: MessageFns<CMsgGCPlayerInfoSubmit>;
export declare const CMsgGCPlayerInfoSubmitResponse: MessageFns<CMsgGCPlayerInfoSubmitResponse>;
export declare const CMsgDOTAEmoticonAccessSDO: MessageFns<CMsgDOTAEmoticonAccessSDO>;
export declare const CMsgClientToGCEmoticonDataRequest: MessageFns<CMsgClientToGCEmoticonDataRequest>;
export declare const CMsgGCToClientEmoticonData: MessageFns<CMsgGCToClientEmoticonData>;
export declare const CMsgGCToClientTournamentItemDrop: MessageFns<CMsgGCToClientTournamentItemDrop>;
export declare const CMsgClientToGCGetAllHeroOrder: MessageFns<CMsgClientToGCGetAllHeroOrder>;
export declare const CMsgClientToGCGetAllHeroOrderResponse: MessageFns<CMsgClientToGCGetAllHeroOrderResponse>;
export declare const CMsgClientToGCGetAllHeroProgress: MessageFns<CMsgClientToGCGetAllHeroProgress>;
export declare const CMsgClientToGCGetAllHeroProgressResponse: MessageFns<CMsgClientToGCGetAllHeroProgressResponse>;
export declare const CMsgClientToGCGetTrophyList: MessageFns<CMsgClientToGCGetTrophyList>;
export declare const CMsgClientToGCGetTrophyListResponse: MessageFns<CMsgClientToGCGetTrophyListResponse>;
export declare const CMsgClientToGCGetTrophyListResponse_Trophy: MessageFns<CMsgClientToGCGetTrophyListResponse_Trophy>;
export declare const CMsgGCToClientTrophyAwarded: MessageFns<CMsgGCToClientTrophyAwarded>;
export declare const CMsgClientToGCRankRequest: MessageFns<CMsgClientToGCRankRequest>;
export declare const CMsgGCToClientRankResponse: MessageFns<CMsgGCToClientRankResponse>;
export declare const CMsgGCToClientRankUpdate: MessageFns<CMsgGCToClientRankUpdate>;
export declare const CMsgClientToGCGetProfileCard: MessageFns<CMsgClientToGCGetProfileCard>;
export declare const CMsgClientToGCSetProfileCardSlots: MessageFns<CMsgClientToGCSetProfileCardSlots>;
export declare const CMsgClientToGCSetProfileCardSlots_CardSlot: MessageFns<CMsgClientToGCSetProfileCardSlots_CardSlot>;
export declare const CMsgClientToGCGetProfileCardStats: MessageFns<CMsgClientToGCGetProfileCardStats>;
export declare const CMsgClientToGCCreateHeroStatue: MessageFns<CMsgClientToGCCreateHeroStatue>;
export declare const CMsgGCToClientHeroStatueCreateResult: MessageFns<CMsgGCToClientHeroStatueCreateResult>;
export declare const CMsgClientToGCPlayerStatsRequest: MessageFns<CMsgClientToGCPlayerStatsRequest>;
export declare const CMsgGCToClientPlayerStatsResponse: MessageFns<CMsgGCToClientPlayerStatsResponse>;
export declare const CMsgClientToGCCustomGamesFriendsPlayedRequest: MessageFns<CMsgClientToGCCustomGamesFriendsPlayedRequest>;
export declare const CMsgGCToClientCustomGamesFriendsPlayedResponse: MessageFns<CMsgGCToClientCustomGamesFriendsPlayedResponse>;
export declare const CMsgGCToClientCustomGamesFriendsPlayedResponse_CustomGame: MessageFns<CMsgGCToClientCustomGamesFriendsPlayedResponse_CustomGame>;
export declare const CMsgClientToGCSocialFeedPostCommentRequest: MessageFns<CMsgClientToGCSocialFeedPostCommentRequest>;
export declare const CMsgGCToClientSocialFeedPostCommentResponse: MessageFns<CMsgGCToClientSocialFeedPostCommentResponse>;
export declare const CMsgClientToGCSocialFeedPostMessageRequest: MessageFns<CMsgClientToGCSocialFeedPostMessageRequest>;
export declare const CMsgGCToClientSocialFeedPostMessageResponse: MessageFns<CMsgGCToClientSocialFeedPostMessageResponse>;
export declare const CMsgClientToGCFriendsPlayedCustomGameRequest: MessageFns<CMsgClientToGCFriendsPlayedCustomGameRequest>;
export declare const CMsgGCToClientFriendsPlayedCustomGameResponse: MessageFns<CMsgGCToClientFriendsPlayedCustomGameResponse>;
export declare const CMsgDOTAPartyRichPresence: MessageFns<CMsgDOTAPartyRichPresence>;
export declare const CMsgDOTAPartyRichPresence_Member: MessageFns<CMsgDOTAPartyRichPresence_Member>;
export declare const CMsgDOTAPartyRichPresence_WeekendTourney: MessageFns<CMsgDOTAPartyRichPresence_WeekendTourney>;
export declare const CMsgDOTALobbyRichPresence: MessageFns<CMsgDOTALobbyRichPresence>;
export declare const CMsgDOTACustomGameListenServerStartedLoading: MessageFns<CMsgDOTACustomGameListenServerStartedLoading>;
export declare const CMsgDOTACustomGameClientFinishedLoading: MessageFns<CMsgDOTACustomGameClientFinishedLoading>;
export declare const CMsgClientToGCApplyGemCombiner: MessageFns<CMsgClientToGCApplyGemCombiner>;
export declare const CMsgClientToGCH264Unsupported: MessageFns<CMsgClientToGCH264Unsupported>;
export declare const CMsgClientToGCGetQuestProgress: MessageFns<CMsgClientToGCGetQuestProgress>;
export declare const CMsgClientToGCGetQuestProgressResponse: MessageFns<CMsgClientToGCGetQuestProgressResponse>;
export declare const CMsgClientToGCGetQuestProgressResponse_Challenge: MessageFns<CMsgClientToGCGetQuestProgressResponse_Challenge>;
export declare const CMsgClientToGCGetQuestProgressResponse_Quest: MessageFns<CMsgClientToGCGetQuestProgressResponse_Quest>;
export declare const CMsgGCToClientMatchSignedOut: MessageFns<CMsgGCToClientMatchSignedOut>;
export declare const CMsgGCGetHeroStatsHistory: MessageFns<CMsgGCGetHeroStatsHistory>;
export declare const CMsgGCGetHeroStatsHistoryResponse: MessageFns<CMsgGCGetHeroStatsHistoryResponse>;
export declare const CMsgPlayerConductScorecardRequest: MessageFns<CMsgPlayerConductScorecardRequest>;
export declare const CMsgPlayerConductScorecard: MessageFns<CMsgPlayerConductScorecard>;
export declare const CMsgClientToGCWageringRequest: MessageFns<CMsgClientToGCWageringRequest>;
export declare const CMsgGCToClientWageringResponse: MessageFns<CMsgGCToClientWageringResponse>;
export declare const CMsgGCToClientWageringUpdate: MessageFns<CMsgGCToClientWageringUpdate>;
export declare const CMsgGCToClientArcanaVotesUpdate: MessageFns<CMsgGCToClientArcanaVotesUpdate>;
export declare const CMsgClientToGCGetEventGoals: MessageFns<CMsgClientToGCGetEventGoals>;
export declare const CMsgEventGoals: MessageFns<CMsgEventGoals>;
export declare const CMsgEventGoals_EventGoal: MessageFns<CMsgEventGoals_EventGoal>;
export declare const CMsgGCToGCLeaguePredictions: MessageFns<CMsgGCToGCLeaguePredictions>;
export declare const CMsgPredictionRankings: MessageFns<CMsgPredictionRankings>;
export declare const CMsgPredictionRankings_PredictionLine: MessageFns<CMsgPredictionRankings_PredictionLine>;
export declare const CMsgPredictionRankings_Prediction: MessageFns<CMsgPredictionRankings_Prediction>;
export declare const CMsgPredictionResults: MessageFns<CMsgPredictionResults>;
export declare const CMsgPredictionResults_ResultBreakdown: MessageFns<CMsgPredictionResults_ResultBreakdown>;
export declare const CMsgPredictionResults_Result: MessageFns<CMsgPredictionResults_Result>;
export declare const CMsgClientToGCHasPlayerVotedForMVP: MessageFns<CMsgClientToGCHasPlayerVotedForMVP>;
export declare const CMsgClientToGCHasPlayerVotedForMVPResponse: MessageFns<CMsgClientToGCHasPlayerVotedForMVPResponse>;
export declare const CMsgClientToGCVoteForMVP: MessageFns<CMsgClientToGCVoteForMVP>;
export declare const CMsgClientToGCVoteForMVPResponse: MessageFns<CMsgClientToGCVoteForMVPResponse>;
export declare const CMsgClientToGCMVPVoteTimeout: MessageFns<CMsgClientToGCMVPVoteTimeout>;
export declare const CMsgClientToGCMVPVoteTimeoutResponse: MessageFns<CMsgClientToGCMVPVoteTimeoutResponse>;
export declare const CMsgClientToGCTeammateStatsRequest: MessageFns<CMsgClientToGCTeammateStatsRequest>;
export declare const CMsgClientToGCTeammateStatsResponse: MessageFns<CMsgClientToGCTeammateStatsResponse>;
export declare const CMsgClientToGCTeammateStatsResponse_TeammateStat: MessageFns<CMsgClientToGCTeammateStatsResponse_TeammateStat>;
export declare const CMsgClientToGCVoteForArcana: MessageFns<CMsgClientToGCVoteForArcana>;
export declare const CMsgClientToGCVoteForArcanaResponse: MessageFns<CMsgClientToGCVoteForArcanaResponse>;
export declare const CMsgClientToGCRequestArcanaVotesRemaining: MessageFns<CMsgClientToGCRequestArcanaVotesRemaining>;
export declare const CMsgClientToGCRequestArcanaVotesRemainingResponse: MessageFns<CMsgClientToGCRequestArcanaVotesRemainingResponse>;
export declare const CMsgClientToGCRequestEventPointLogV2: MessageFns<CMsgClientToGCRequestEventPointLogV2>;
export declare const CMsgClientToGCRequestEventPointLogResponseV2: MessageFns<CMsgClientToGCRequestEventPointLogResponseV2>;
export declare const CMsgClientToGCRequestEventPointLogResponseV2_LogEntry: MessageFns<CMsgClientToGCRequestEventPointLogResponseV2_LogEntry>;
export declare const CMsgClientToGCPublishUserStat: MessageFns<CMsgClientToGCPublishUserStat>;
export declare const CMsgClientToGCRequestSlarkGameResult: MessageFns<CMsgClientToGCRequestSlarkGameResult>;
export declare const CMsgClientToGCRequestSlarkGameResultResponse: MessageFns<CMsgClientToGCRequestSlarkGameResultResponse>;
export declare const CMsgGCToClientQuestProgressUpdated: MessageFns<CMsgGCToClientQuestProgressUpdated>;
export declare const CMsgGCToClientQuestProgressUpdated_Challenge: MessageFns<CMsgGCToClientQuestProgressUpdated_Challenge>;
export declare const CMsgDOTARedeemItem: MessageFns<CMsgDOTARedeemItem>;
export declare const CMsgDOTARedeemItemResponse: MessageFns<CMsgDOTARedeemItemResponse>;
export declare const CMsgClientToGCSelectCompendiumInGamePrediction: MessageFns<CMsgClientToGCSelectCompendiumInGamePrediction>;
export declare const CMsgClientToGCSelectCompendiumInGamePrediction_Prediction: MessageFns<CMsgClientToGCSelectCompendiumInGamePrediction_Prediction>;
export declare const CMsgClientToGCSelectCompendiumInGamePredictionResponse: MessageFns<CMsgClientToGCSelectCompendiumInGamePredictionResponse>;
export declare const CMsgClientToGCOpenPlayerCardPack: MessageFns<CMsgClientToGCOpenPlayerCardPack>;
export declare const CMsgClientToGCOpenPlayerCardPackResponse: MessageFns<CMsgClientToGCOpenPlayerCardPackResponse>;
export declare const CMsgClientToGCRecyclePlayerCard: MessageFns<CMsgClientToGCRecyclePlayerCard>;
export declare const CMsgClientToGCRecyclePlayerCardResponse: MessageFns<CMsgClientToGCRecyclePlayerCardResponse>;
export declare const CMsgClientToGCCreatePlayerCardPack: MessageFns<CMsgClientToGCCreatePlayerCardPack>;
export declare const CMsgClientToGCCreatePlayerCardPackResponse: MessageFns<CMsgClientToGCCreatePlayerCardPackResponse>;
export declare const CMsgClientToGCCreateTeamPlayerCardPack: MessageFns<CMsgClientToGCCreateTeamPlayerCardPack>;
export declare const CMsgClientToGCCreateTeamPlayerCardPackResponse: MessageFns<CMsgClientToGCCreateTeamPlayerCardPackResponse>;
export declare const CMsgGCToClientBattlePassRollupInternational2016: MessageFns<CMsgGCToClientBattlePassRollupInternational2016>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_Questlines: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_Questlines>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_Wagering: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_Wagering>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_Achievements: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_Achievements>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_BattleCup: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_BattleCup>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_Predictions: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_Predictions>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_Bracket: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_Bracket>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_PlayerCard: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_PlayerCard>;
export declare const CMsgGCToClientBattlePassRollupInternational2016_FantasyChallenge: MessageFns<CMsgGCToClientBattlePassRollupInternational2016_FantasyChallenge>;
export declare const CMsgGCToClientBattlePassRollupFall2016: MessageFns<CMsgGCToClientBattlePassRollupFall2016>;
export declare const CMsgGCToClientBattlePassRollupFall2016_Questlines: MessageFns<CMsgGCToClientBattlePassRollupFall2016_Questlines>;
export declare const CMsgGCToClientBattlePassRollupFall2016_Wagering: MessageFns<CMsgGCToClientBattlePassRollupFall2016_Wagering>;
export declare const CMsgGCToClientBattlePassRollupFall2016_Achievements: MessageFns<CMsgGCToClientBattlePassRollupFall2016_Achievements>;
export declare const CMsgGCToClientBattlePassRollupFall2016_BattleCup: MessageFns<CMsgGCToClientBattlePassRollupFall2016_BattleCup>;
export declare const CMsgGCToClientBattlePassRollupFall2016_Predictions: MessageFns<CMsgGCToClientBattlePassRollupFall2016_Predictions>;
export declare const CMsgGCToClientBattlePassRollupFall2016_Bracket: MessageFns<CMsgGCToClientBattlePassRollupFall2016_Bracket>;
export declare const CMsgGCToClientBattlePassRollupFall2016_PlayerCard: MessageFns<CMsgGCToClientBattlePassRollupFall2016_PlayerCard>;
export declare const CMsgGCToClientBattlePassRollupFall2016_FantasyChallenge: MessageFns<CMsgGCToClientBattlePassRollupFall2016_FantasyChallenge>;
export declare const CMsgGCToClientBattlePassRollupWinter2017: MessageFns<CMsgGCToClientBattlePassRollupWinter2017>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_Questlines: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_Questlines>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_Wagering: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_Wagering>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_Achievements: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_Achievements>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_BattleCup: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_BattleCup>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_Predictions: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_Predictions>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_Bracket: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_Bracket>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_PlayerCard: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_PlayerCard>;
export declare const CMsgGCToClientBattlePassRollupWinter2017_FantasyChallenge: MessageFns<CMsgGCToClientBattlePassRollupWinter2017_FantasyChallenge>;
export declare const CMsgGCToClientBattlePassRollupTI7: MessageFns<CMsgGCToClientBattlePassRollupTI7>;
export declare const CMsgGCToClientBattlePassRollupTI7_Questlines: MessageFns<CMsgGCToClientBattlePassRollupTI7_Questlines>;
export declare const CMsgGCToClientBattlePassRollupTI7_Wagering: MessageFns<CMsgGCToClientBattlePassRollupTI7_Wagering>;
export declare const CMsgGCToClientBattlePassRollupTI7_Achievements: MessageFns<CMsgGCToClientBattlePassRollupTI7_Achievements>;
export declare const CMsgGCToClientBattlePassRollupTI7_BattleCup: MessageFns<CMsgGCToClientBattlePassRollupTI7_BattleCup>;
export declare const CMsgGCToClientBattlePassRollupTI7_Predictions: MessageFns<CMsgGCToClientBattlePassRollupTI7_Predictions>;
export declare const CMsgGCToClientBattlePassRollupTI7_Bracket: MessageFns<CMsgGCToClientBattlePassRollupTI7_Bracket>;
export declare const CMsgGCToClientBattlePassRollupTI7_PlayerCard: MessageFns<CMsgGCToClientBattlePassRollupTI7_PlayerCard>;
export declare const CMsgGCToClientBattlePassRollupTI7_FantasyChallenge: MessageFns<CMsgGCToClientBattlePassRollupTI7_FantasyChallenge>;
export declare const CMsgGCToClientBattlePassRollupTI8: MessageFns<CMsgGCToClientBattlePassRollupTI8>;
export declare const CMsgGCToClientBattlePassRollupTI8_CavernCrawl: MessageFns<CMsgGCToClientBattlePassRollupTI8_CavernCrawl>;
export declare const CMsgGCToClientBattlePassRollupTI8_Wagering: MessageFns<CMsgGCToClientBattlePassRollupTI8_Wagering>;
export declare const CMsgGCToClientBattlePassRollupTI8_Achievements: MessageFns<CMsgGCToClientBattlePassRollupTI8_Achievements>;
export declare const CMsgGCToClientBattlePassRollupTI8_Predictions: MessageFns<CMsgGCToClientBattlePassRollupTI8_Predictions>;
export declare const CMsgGCToClientBattlePassRollupTI8_Bracket: MessageFns<CMsgGCToClientBattlePassRollupTI8_Bracket>;
export declare const CMsgGCToClientBattlePassRollupTI8_PlayerCard: MessageFns<CMsgGCToClientBattlePassRollupTI8_PlayerCard>;
export declare const CMsgGCToClientBattlePassRollupTI8_FantasyChallenge: MessageFns<CMsgGCToClientBattlePassRollupTI8_FantasyChallenge>;
export declare const CMsgGCToClientBattlePassRollupTI9: MessageFns<CMsgGCToClientBattlePassRollupTI9>;
export declare const CMsgGCToClientBattlePassRollupTI10: MessageFns<CMsgGCToClientBattlePassRollupTI10>;
export declare const CMsgGCToClientBattlePassRollupRequest: MessageFns<CMsgGCToClientBattlePassRollupRequest>;
export declare const CMsgGCToClientBattlePassRollupResponse: MessageFns<CMsgGCToClientBattlePassRollupResponse>;
export declare const CMsgGCToClientBattlePassRollupListRequest: MessageFns<CMsgGCToClientBattlePassRollupListRequest>;
export declare const CMsgGCToClientBattlePassRollupListResponse: MessageFns<CMsgGCToClientBattlePassRollupListResponse>;
export declare const CMsgGCToClientBattlePassRollupListResponse_EventInfo: MessageFns<CMsgGCToClientBattlePassRollupListResponse_EventInfo>;
export declare const CMsgClientToGCTransferSeasonalMMRRequest: MessageFns<CMsgClientToGCTransferSeasonalMMRRequest>;
export declare const CMsgClientToGCTransferSeasonalMMRResponse: MessageFns<CMsgClientToGCTransferSeasonalMMRResponse>;
export declare const CMsgGCToClientPlaytestStatus: MessageFns<CMsgGCToClientPlaytestStatus>;
export declare const CMsgClientToGCJoinPlaytest: MessageFns<CMsgClientToGCJoinPlaytest>;
export declare const CMsgClientToGCJoinPlaytestResponse: MessageFns<CMsgClientToGCJoinPlaytestResponse>;
export declare const CMsgDOTASetFavoriteTeam: MessageFns<CMsgDOTASetFavoriteTeam>;
export declare const CMsgDOTATriviaCurrentQuestions: MessageFns<CMsgDOTATriviaCurrentQuestions>;
export declare const CMsgDOTASubmitTriviaQuestionAnswer: MessageFns<CMsgDOTASubmitTriviaQuestionAnswer>;
export declare const CMsgDOTASubmitTriviaQuestionAnswerResponse: MessageFns<CMsgDOTASubmitTriviaQuestionAnswerResponse>;
export declare const CMsgDOTAStartTriviaSession: MessageFns<CMsgDOTAStartTriviaSession>;
export declare const CMsgDOTAStartTriviaSessionResponse: MessageFns<CMsgDOTAStartTriviaSessionResponse>;
export declare const CMsgDOTAAnchorPhoneNumberRequest: MessageFns<CMsgDOTAAnchorPhoneNumberRequest>;
export declare const CMsgDOTAAnchorPhoneNumberResponse: MessageFns<CMsgDOTAAnchorPhoneNumberResponse>;
export declare const CMsgDOTAUnanchorPhoneNumberRequest: MessageFns<CMsgDOTAUnanchorPhoneNumberRequest>;
export declare const CMsgDOTAUnanchorPhoneNumberResponse: MessageFns<CMsgDOTAUnanchorPhoneNumberResponse>;
export declare const CMsgGCToClientCommendNotification: MessageFns<CMsgGCToClientCommendNotification>;
export declare const CMsgDOTAClientToGCQuickStatsRequest: MessageFns<CMsgDOTAClientToGCQuickStatsRequest>;
export declare const CMsgDOTAClientToGCQuickStatsResponse: MessageFns<CMsgDOTAClientToGCQuickStatsResponse>;
export declare const CMsgDOTAClientToGCQuickStatsResponse_SimpleStats: MessageFns<CMsgDOTAClientToGCQuickStatsResponse_SimpleStats>;
export declare const CMsgDOTASelectionPriorityChoiceRequest: MessageFns<CMsgDOTASelectionPriorityChoiceRequest>;
export declare const CMsgDOTASelectionPriorityChoiceResponse: MessageFns<CMsgDOTASelectionPriorityChoiceResponse>;
export declare const CMsgDOTAGameAutographReward: MessageFns<CMsgDOTAGameAutographReward>;
export declare const CMsgDOTAGameAutographRewardResponse: MessageFns<CMsgDOTAGameAutographRewardResponse>;
export declare const CMsgDOTADestroyLobbyRequest: MessageFns<CMsgDOTADestroyLobbyRequest>;
export declare const CMsgDOTADestroyLobbyResponse: MessageFns<CMsgDOTADestroyLobbyResponse>;
export declare const CMsgDOTAGetRecentPlayTimeFriendsRequest: MessageFns<CMsgDOTAGetRecentPlayTimeFriendsRequest>;
export declare const CMsgDOTAGetRecentPlayTimeFriendsResponse: MessageFns<CMsgDOTAGetRecentPlayTimeFriendsResponse>;
export declare const CMsgPurchaseItemWithEventPoints: MessageFns<CMsgPurchaseItemWithEventPoints>;
export declare const CMsgPurchaseItemWithEventPointsResponse: MessageFns<CMsgPurchaseItemWithEventPointsResponse>;
export declare const CMsgPurchaseHeroRandomRelic: MessageFns<CMsgPurchaseHeroRandomRelic>;
export declare const CMsgPurchaseHeroRandomRelicResponse: MessageFns<CMsgPurchaseHeroRandomRelicResponse>;
export declare const CMsgClientToGCRequestPlusWeeklyChallengeResult: MessageFns<CMsgClientToGCRequestPlusWeeklyChallengeResult>;
export declare const CMsgClientToGCRequestPlusWeeklyChallengeResultResponse: MessageFns<CMsgClientToGCRequestPlusWeeklyChallengeResultResponse>;
export declare const CMsgProfileRequest: MessageFns<CMsgProfileRequest>;
export declare const CMsgProfileResponse: MessageFns<CMsgProfileResponse>;
export declare const CMsgProfileResponse_FeaturedHero: MessageFns<CMsgProfileResponse_FeaturedHero>;
export declare const CMsgProfileResponse_MatchInfo: MessageFns<CMsgProfileResponse_MatchInfo>;
export declare const CMsgProfileUpdate: MessageFns<CMsgProfileUpdate>;
export declare const CMsgProfileUpdateResponse: MessageFns<CMsgProfileUpdateResponse>;
export declare const CMsgTalentWinRates: MessageFns<CMsgTalentWinRates>;
export declare const CMsgGlobalHeroAverages: MessageFns<CMsgGlobalHeroAverages>;
export declare const CMsgHeroGlobalDataRequest: MessageFns<CMsgHeroGlobalDataRequest>;
export declare const CMsgHeroGlobalDataResponse: MessageFns<CMsgHeroGlobalDataResponse>;
export declare const CMsgHeroGlobalDataResponse_GraphData: MessageFns<CMsgHeroGlobalDataResponse_GraphData>;
export declare const CMsgHeroGlobalDataResponse_WeekData: MessageFns<CMsgHeroGlobalDataResponse_WeekData>;
export declare const CMsgHeroGlobalDataResponse_HeroDataPerRankChunk: MessageFns<CMsgHeroGlobalDataResponse_HeroDataPerRankChunk>;
export declare const CMsgHeroGlobalDataAllHeroes: MessageFns<CMsgHeroGlobalDataAllHeroes>;
export declare const CMsgHeroGlobalDataHeroesAlliesAndEnemies: MessageFns<CMsgHeroGlobalDataHeroesAlliesAndEnemies>;
export declare const CMsgHeroGlobalDataHeroesAlliesAndEnemies_HeroData: MessageFns<CMsgHeroGlobalDataHeroesAlliesAndEnemies_HeroData>;
export declare const CMsgHeroGlobalDataHeroesAlliesAndEnemies_RankedHeroData: MessageFns<CMsgHeroGlobalDataHeroesAlliesAndEnemies_RankedHeroData>;
export declare const CMsgPrivateMetadataKeyRequest: MessageFns<CMsgPrivateMetadataKeyRequest>;
export declare const CMsgPrivateMetadataKeyResponse: MessageFns<CMsgPrivateMetadataKeyResponse>;
export declare const CMsgActivatePlusFreeTrialResponse: MessageFns<CMsgActivatePlusFreeTrialResponse>;
export declare const CMsgGCToClientCavernCrawlMapPathCompleted: MessageFns<CMsgGCToClientCavernCrawlMapPathCompleted>;
export declare const CMsgGCToClientCavernCrawlMapPathCompleted_CompletedPathInfo: MessageFns<CMsgGCToClientCavernCrawlMapPathCompleted_CompletedPathInfo>;
export declare const CMsgGCToClientCavernCrawlMapUpdated: MessageFns<CMsgGCToClientCavernCrawlMapUpdated>;
export declare const CMsgClientToGCCavernCrawlClaimRoom: MessageFns<CMsgClientToGCCavernCrawlClaimRoom>;
export declare const CMsgClientToGCCavernCrawlClaimRoomResponse: MessageFns<CMsgClientToGCCavernCrawlClaimRoomResponse>;
export declare const CMsgClientToGCCavernCrawlUseItemOnRoom: MessageFns<CMsgClientToGCCavernCrawlUseItemOnRoom>;
export declare const CMsgClientToGCCavernCrawlUseItemOnRoomResponse: MessageFns<CMsgClientToGCCavernCrawlUseItemOnRoomResponse>;
export declare const CMsgClientToGCCavernCrawlUseItemOnPath: MessageFns<CMsgClientToGCCavernCrawlUseItemOnPath>;
export declare const CMsgClientToGCCavernCrawlUseItemOnPathResponse: MessageFns<CMsgClientToGCCavernCrawlUseItemOnPathResponse>;
export declare const CMsgClientToGCCavernCrawlRequestMapState: MessageFns<CMsgClientToGCCavernCrawlRequestMapState>;
export declare const CMsgClientToGCCavernCrawlRequestMapStateResponse: MessageFns<CMsgClientToGCCavernCrawlRequestMapStateResponse>;
export declare const CMsgClientToGCCavernCrawlRequestMapStateResponse_SwappedChallenge: MessageFns<CMsgClientToGCCavernCrawlRequestMapStateResponse_SwappedChallenge>;
export declare const CMsgClientToGCCavernCrawlRequestMapStateResponse_InventoryItem: MessageFns<CMsgClientToGCCavernCrawlRequestMapStateResponse_InventoryItem>;
export declare const CMsgClientToGCCavernCrawlRequestMapStateResponse_TreasureMap: MessageFns<CMsgClientToGCCavernCrawlRequestMapStateResponse_TreasureMap>;
export declare const CMsgClientToGCCavernCrawlRequestMapStateResponse_MapVariant: MessageFns<CMsgClientToGCCavernCrawlRequestMapStateResponse_MapVariant>;
export declare const CMsgClientToGCCavernCrawlGetClaimedRoomCount: MessageFns<CMsgClientToGCCavernCrawlGetClaimedRoomCount>;
export declare const CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse: MessageFns<CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse>;
export declare const CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_MapVariant: MessageFns<CMsgClientToGCCavernCrawlGetClaimedRoomCountResponse_MapVariant>;
export declare const CMsgDOTAMutationList: MessageFns<CMsgDOTAMutationList>;
export declare const CMsgDOTAMutationList_Mutation: MessageFns<CMsgDOTAMutationList_Mutation>;
export declare const CMsgEventTipsSummaryRequest: MessageFns<CMsgEventTipsSummaryRequest>;
export declare const CMsgEventTipsSummaryResponse: MessageFns<CMsgEventTipsSummaryResponse>;
export declare const CMsgEventTipsSummaryResponse_Tipper: MessageFns<CMsgEventTipsSummaryResponse_Tipper>;
export declare const CMsgSocialFeedRequest: MessageFns<CMsgSocialFeedRequest>;
export declare const CMsgSocialFeedResponse: MessageFns<CMsgSocialFeedResponse>;
export declare const CMsgSocialFeedResponse_FeedEvent: MessageFns<CMsgSocialFeedResponse_FeedEvent>;
export declare const CMsgSocialFeedCommentsRequest: MessageFns<CMsgSocialFeedCommentsRequest>;
export declare const CMsgSocialFeedCommentsResponse: MessageFns<CMsgSocialFeedCommentsResponse>;
export declare const CMsgSocialFeedCommentsResponse_FeedComment: MessageFns<CMsgSocialFeedCommentsResponse_FeedComment>;
export declare const CMsgClientToGCPlayerCardSpecificPurchaseRequest: MessageFns<CMsgClientToGCPlayerCardSpecificPurchaseRequest>;
export declare const CMsgClientToGCPlayerCardSpecificPurchaseResponse: MessageFns<CMsgClientToGCPlayerCardSpecificPurchaseResponse>;
export declare const CMsgClientToGCRequestContestVotes: MessageFns<CMsgClientToGCRequestContestVotes>;
export declare const CMsgClientToGCRequestContestVotesResponse: MessageFns<CMsgClientToGCRequestContestVotesResponse>;
export declare const CMsgClientToGCRequestContestVotesResponse_ItemVote: MessageFns<CMsgClientToGCRequestContestVotesResponse_ItemVote>;
export declare const CMsgClientToGCRecordContestVote: MessageFns<CMsgClientToGCRecordContestVote>;
export declare const CMsgGCToClientRecordContestVoteResponse: MessageFns<CMsgGCToClientRecordContestVoteResponse>;
export declare const CMsgDevGrantEventPoints: MessageFns<CMsgDevGrantEventPoints>;
export declare const CMsgDevGrantEventPointsResponse: MessageFns<CMsgDevGrantEventPointsResponse>;
export declare const CMsgDevGrantEventAction: MessageFns<CMsgDevGrantEventAction>;
export declare const CMsgDevGrantEventActionResponse: MessageFns<CMsgDevGrantEventActionResponse>;
export declare const CMsgDevDeleteEventActions: MessageFns<CMsgDevDeleteEventActions>;
export declare const CMsgDevDeleteEventActionsResponse: MessageFns<CMsgDevDeleteEventActionsResponse>;
export declare const CMsgDevResetEventState: MessageFns<CMsgDevResetEventState>;
export declare const CMsgDevResetEventStateResponse: MessageFns<CMsgDevResetEventStateResponse>;
export declare const CMsgConsumeEventSupportGrantItem: MessageFns<CMsgConsumeEventSupportGrantItem>;
export declare const CMsgConsumeEventSupportGrantItemResponse: MessageFns<CMsgConsumeEventSupportGrantItemResponse>;
export declare const CMsgClientToGCGetFilteredPlayers: MessageFns<CMsgClientToGCGetFilteredPlayers>;
export declare const CMsgGCToClientGetFilteredPlayersResponse: MessageFns<CMsgGCToClientGetFilteredPlayersResponse>;
export declare const CMsgGCToClientGetFilteredPlayersResponse_CFilterEntry: MessageFns<CMsgGCToClientGetFilteredPlayersResponse_CFilterEntry>;
export declare const CMsgClientToGCRemoveFilteredPlayer: MessageFns<CMsgClientToGCRemoveFilteredPlayer>;
export declare const CMsgGCToClientRemoveFilteredPlayerResponse: MessageFns<CMsgGCToClientRemoveFilteredPlayerResponse>;
export declare const CMsgClientToGCPurchaseFilteredPlayerSlot: MessageFns<CMsgClientToGCPurchaseFilteredPlayerSlot>;
export declare const CMsgGCToClientPurchaseFilteredPlayerSlotResponse: MessageFns<CMsgGCToClientPurchaseFilteredPlayerSlotResponse>;
export declare const CMsgClientToGCUpdateFilteredPlayerNote: MessageFns<CMsgClientToGCUpdateFilteredPlayerNote>;
export declare const CMsgGCToClientUpdateFilteredPlayerNoteResponse: MessageFns<CMsgGCToClientUpdateFilteredPlayerNoteResponse>;
export declare const CMsgPartySearchPlayer: MessageFns<CMsgPartySearchPlayer>;
export declare const CMsgGCToClientPlayerBeaconState: MessageFns<CMsgGCToClientPlayerBeaconState>;
export declare const CMsgGCToClientPartyBeaconUpdate: MessageFns<CMsgGCToClientPartyBeaconUpdate>;
export declare const CMsgClientToGCUpdatePartyBeacon: MessageFns<CMsgClientToGCUpdatePartyBeacon>;
export declare const CMsgClientToGCRequestActiveBeaconParties: MessageFns<CMsgClientToGCRequestActiveBeaconParties>;
export declare const CMsgGCToClientRequestActiveBeaconPartiesResponse: MessageFns<CMsgGCToClientRequestActiveBeaconPartiesResponse>;
export declare const CMsgClientToGCJoinPartyFromBeacon: MessageFns<CMsgClientToGCJoinPartyFromBeacon>;
export declare const CMsgGCToClientJoinPartyFromBeaconResponse: MessageFns<CMsgGCToClientJoinPartyFromBeaconResponse>;
export declare const CMsgClientToGCManageFavorites: MessageFns<CMsgClientToGCManageFavorites>;
export declare const CMsgGCToClientManageFavoritesResponse: MessageFns<CMsgGCToClientManageFavoritesResponse>;
export declare const CMsgClientToGCGetFavoritePlayers: MessageFns<CMsgClientToGCGetFavoritePlayers>;
export declare const CMsgGCToClientGetFavoritePlayersResponse: MessageFns<CMsgGCToClientGetFavoritePlayersResponse>;
export declare const CMsgGCToClientPartySearchInvite: MessageFns<CMsgGCToClientPartySearchInvite>;
export declare const CMsgClientToGCVerifyFavoritePlayers: MessageFns<CMsgClientToGCVerifyFavoritePlayers>;
export declare const CMsgGCToClientVerifyFavoritePlayersResponse: MessageFns<CMsgGCToClientVerifyFavoritePlayersResponse>;
export declare const CMsgGCToClientVerifyFavoritePlayersResponse_Result: MessageFns<CMsgGCToClientVerifyFavoritePlayersResponse_Result>;
export declare const CMsgClientToGCRequestPlayerRecentAccomplishments: MessageFns<CMsgClientToGCRequestPlayerRecentAccomplishments>;
export declare const CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse: MessageFns<CMsgClientToGCRequestPlayerRecentAccomplishmentsResponse>;
export declare const CMsgClientToGCRequestPlayerHeroRecentAccomplishments: MessageFns<CMsgClientToGCRequestPlayerHeroRecentAccomplishments>;
export declare const CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse: MessageFns<CMsgClientToGCRequestPlayerHeroRecentAccomplishmentsResponse>;
export declare const CMsgClientToGCSubmitPlayerMatchSurvey: MessageFns<CMsgClientToGCSubmitPlayerMatchSurvey>;
export declare const CMsgClientToGCSubmitPlayerMatchSurveyResponse: MessageFns<CMsgClientToGCSubmitPlayerMatchSurveyResponse>;
export declare const CMsgGCToClientVACReminder: MessageFns<CMsgGCToClientVACReminder>;
export declare const CMsgClientToGCUnderDraftRequest: MessageFns<CMsgClientToGCUnderDraftRequest>;
export declare const CMsgClientToGCUnderDraftResponse: MessageFns<CMsgClientToGCUnderDraftResponse>;
export declare const CMsgClientToGCUnderDraftReroll: MessageFns<CMsgClientToGCUnderDraftReroll>;
export declare const CMsgClientToGCUnderDraftRerollResponse: MessageFns<CMsgClientToGCUnderDraftRerollResponse>;
export declare const CMsgClientToGCUnderDraftBuy: MessageFns<CMsgClientToGCUnderDraftBuy>;
export declare const CMsgGCToClientGuildUnderDraftGoldUpdated: MessageFns<CMsgGCToClientGuildUnderDraftGoldUpdated>;
export declare const CMsgClientToGCUnderDraftBuyResponse: MessageFns<CMsgClientToGCUnderDraftBuyResponse>;
export declare const CMsgClientToGCUnderDraftRollBackBench: MessageFns<CMsgClientToGCUnderDraftRollBackBench>;
export declare const CMsgClientToGCUnderDraftRollBackBenchResponse: MessageFns<CMsgClientToGCUnderDraftRollBackBenchResponse>;
export declare const CMsgClientToGCUnderDraftSell: MessageFns<CMsgClientToGCUnderDraftSell>;
export declare const CMsgClientToGCUnderDraftSellResponse: MessageFns<CMsgClientToGCUnderDraftSellResponse>;
export declare const CMsgClientToGCUnderDraftRedeemReward: MessageFns<CMsgClientToGCUnderDraftRedeemReward>;
export declare const CMsgClientToGCUnderDraftRedeemRewardResponse: MessageFns<CMsgClientToGCUnderDraftRedeemRewardResponse>;
export declare const CMsgClientToGCSubmitDraftTriviaMatchAnswer: MessageFns<CMsgClientToGCSubmitDraftTriviaMatchAnswer>;
export declare const CMsgClientToGCSubmitDraftTriviaMatchAnswerResponse: MessageFns<CMsgClientToGCSubmitDraftTriviaMatchAnswerResponse>;
export declare const CMsgDraftTriviaVoteCount: MessageFns<CMsgDraftTriviaVoteCount>;
export declare const CMsgClientToGCRequestReporterUpdates: MessageFns<CMsgClientToGCRequestReporterUpdates>;
export declare const CMsgClientToGCRequestReporterUpdatesResponse: MessageFns<CMsgClientToGCRequestReporterUpdatesResponse>;
export declare const CMsgClientToGCRequestReporterUpdatesResponse_ReporterUpdate: MessageFns<CMsgClientToGCRequestReporterUpdatesResponse_ReporterUpdate>;
export declare const CMsgClientToGCAcknowledgeReporterUpdates: MessageFns<CMsgClientToGCAcknowledgeReporterUpdates>;
export declare const CMsgClientToGCRecalibrateMMR: MessageFns<CMsgClientToGCRecalibrateMMR>;
export declare const CMsgClientToGCRecalibrateMMRResponse: MessageFns<CMsgClientToGCRecalibrateMMRResponse>;
export declare const CMsgDOTAPostGameItemAwardNotification: MessageFns<CMsgDOTAPostGameItemAwardNotification>;
export declare const CMsgClientToGCGetOWMatchDetails: MessageFns<CMsgClientToGCGetOWMatchDetails>;
export declare const CMsgClientToGCGetOWMatchDetailsResponse: MessageFns<CMsgClientToGCGetOWMatchDetailsResponse>;
export declare const CMsgClientToGCGetOWMatchDetailsResponse_Marker: MessageFns<CMsgClientToGCGetOWMatchDetailsResponse_Marker>;
export declare const CMsgClientToGCSubmitOWConviction: MessageFns<CMsgClientToGCSubmitOWConviction>;
export declare const CMsgClientToGCSubmitOWConvictionResponse: MessageFns<CMsgClientToGCSubmitOWConvictionResponse>;
export declare const CMsgClientToGCChinaSSAURLRequest: MessageFns<CMsgClientToGCChinaSSAURLRequest>;
export declare const CMsgClientToGCChinaSSAURLResponse: MessageFns<CMsgClientToGCChinaSSAURLResponse>;
export declare const CMsgClientToGCChinaSSAAcceptedRequest: MessageFns<CMsgClientToGCChinaSSAAcceptedRequest>;
export declare const CMsgClientToGCChinaSSAAcceptedResponse: MessageFns<CMsgClientToGCChinaSSAAcceptedResponse>;
export declare const CMsgGCToClientOverwatchCasesAvailable: MessageFns<CMsgGCToClientOverwatchCasesAvailable>;
export declare const CMsgClientToGCStartWatchingOverwatch: MessageFns<CMsgClientToGCStartWatchingOverwatch>;
export declare const CMsgClientToGCStopWatchingOverwatch: MessageFns<CMsgClientToGCStopWatchingOverwatch>;
export declare const CMsgClientToGCOverwatchReplayError: MessageFns<CMsgClientToGCOverwatchReplayError>;
export declare const CMsgClientToGCGetDPCFavorites: MessageFns<CMsgClientToGCGetDPCFavorites>;
export declare const CMsgClientToGCGetDPCFavoritesResponse: MessageFns<CMsgClientToGCGetDPCFavoritesResponse>;
export declare const CMsgClientToGCGetDPCFavoritesResponse_Favorite: MessageFns<CMsgClientToGCGetDPCFavoritesResponse_Favorite>;
export declare const CMsgClientToGCSetDPCFavoriteState: MessageFns<CMsgClientToGCSetDPCFavoriteState>;
export declare const CMsgClientToGCSetDPCFavoriteStateResponse: MessageFns<CMsgClientToGCSetDPCFavoriteStateResponse>;
export declare const CMsgClientToGCSetEventActiveSeasonID: MessageFns<CMsgClientToGCSetEventActiveSeasonID>;
export declare const CMsgClientToGCSetEventActiveSeasonIDResponse: MessageFns<CMsgClientToGCSetEventActiveSeasonIDResponse>;
export declare const CMsgClientToGCPurchaseLabyrinthBlessings: MessageFns<CMsgClientToGCPurchaseLabyrinthBlessings>;
export declare const CMsgClientToGCPurchaseLabyrinthBlessingsResponse: MessageFns<CMsgClientToGCPurchaseLabyrinthBlessingsResponse>;
export declare const CMsgClientToGCGetStickerbookRequest: MessageFns<CMsgClientToGCGetStickerbookRequest>;
export declare const CMsgClientToGCGetStickerbookResponse: MessageFns<CMsgClientToGCGetStickerbookResponse>;
export declare const CMsgClientToGCCreateStickerbookPageRequest: MessageFns<CMsgClientToGCCreateStickerbookPageRequest>;
export declare const CMsgClientToGCCreateStickerbookPageResponse: MessageFns<CMsgClientToGCCreateStickerbookPageResponse>;
export declare const CMsgClientToGCDeleteStickerbookPageRequest: MessageFns<CMsgClientToGCDeleteStickerbookPageRequest>;
export declare const CMsgClientToGCDeleteStickerbookPageResponse: MessageFns<CMsgClientToGCDeleteStickerbookPageResponse>;
export declare const CMsgClientToGCPlaceStickersRequest: MessageFns<CMsgClientToGCPlaceStickersRequest>;
export declare const CMsgClientToGCPlaceStickersRequest_StickerItem: MessageFns<CMsgClientToGCPlaceStickersRequest_StickerItem>;
export declare const CMsgClientToGCPlaceStickersResponse: MessageFns<CMsgClientToGCPlaceStickersResponse>;
export declare const CMsgClientToGCPlaceCollectionStickersRequest: MessageFns<CMsgClientToGCPlaceCollectionStickersRequest>;
export declare const CMsgClientToGCPlaceCollectionStickersRequest_Slot: MessageFns<CMsgClientToGCPlaceCollectionStickersRequest_Slot>;
export declare const CMsgClientToGCPlaceCollectionStickersResponse: MessageFns<CMsgClientToGCPlaceCollectionStickersResponse>;
export declare const CMsgClientToGCOrderStickerbookTeamPageRequest: MessageFns<CMsgClientToGCOrderStickerbookTeamPageRequest>;
export declare const CMsgClientToGCOrderStickerbookTeamPageResponse: MessageFns<CMsgClientToGCOrderStickerbookTeamPageResponse>;
export declare const CMsgClientToGCSetHeroSticker: MessageFns<CMsgClientToGCSetHeroSticker>;
export declare const CMsgClientToGCSetHeroStickerResponse: MessageFns<CMsgClientToGCSetHeroStickerResponse>;
export declare const CMsgClientToGCGetHeroStickers: MessageFns<CMsgClientToGCGetHeroStickers>;
export declare const CMsgClientToGCGetHeroStickersResponse: MessageFns<CMsgClientToGCGetHeroStickersResponse>;
export declare const CMsgClientToGCSetFavoritePage: MessageFns<CMsgClientToGCSetFavoritePage>;
export declare const CMsgClientToGCSetFavoritePageResponse: MessageFns<CMsgClientToGCSetFavoritePageResponse>;
export declare const CMsgClientToGCClaimSwag: MessageFns<CMsgClientToGCClaimSwag>;
export declare const CMsgClientToGCClaimSwagResponse: MessageFns<CMsgClientToGCClaimSwagResponse>;
export declare const CMsgClientToGCCollectorsCacheAvailableDataRequest: MessageFns<CMsgClientToGCCollectorsCacheAvailableDataRequest>;
export declare const CMsgGCToClientCollectorsCacheAvailableDataResponse: MessageFns<CMsgGCToClientCollectorsCacheAvailableDataResponse>;
export declare const CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote: MessageFns<CMsgGCToClientCollectorsCacheAvailableDataResponse_Vote>;
export declare const CMsgClientToGCUploadMatchClip: MessageFns<CMsgClientToGCUploadMatchClip>;
export declare const CMsgGCToClientUploadMatchClipResponse: MessageFns<CMsgGCToClientUploadMatchClipResponse>;
export declare const CMsgClientToGCMapStatsRequest: MessageFns<CMsgClientToGCMapStatsRequest>;
export declare const CMsgGCToClientMapStatsResponse: MessageFns<CMsgGCToClientMapStatsResponse>;
export declare const CMsgRoadToTIAssignedQuest: MessageFns<CMsgRoadToTIAssignedQuest>;
export declare const CMsgRoadToTIUserData: MessageFns<CMsgRoadToTIUserData>;
export declare const CMsgClientToGCRoadToTIGetQuests: MessageFns<CMsgClientToGCRoadToTIGetQuests>;
export declare const CMsgClientToGCRoadToTIGetQuestsResponse: MessageFns<CMsgClientToGCRoadToTIGetQuestsResponse>;
export declare const CMsgClientToGCRoadToTIGetActiveQuest: MessageFns<CMsgClientToGCRoadToTIGetActiveQuest>;
export declare const CMsgClientToGCRoadToTIGetActiveQuestResponse: MessageFns<CMsgClientToGCRoadToTIGetActiveQuestResponse>;
export declare const CMsgGCToClientRoadToTIQuestDataUpdated: MessageFns<CMsgGCToClientRoadToTIQuestDataUpdated>;
export declare const CMsgClientToGCRoadToTIUseItem: MessageFns<CMsgClientToGCRoadToTIUseItem>;
export declare const CMsgClientToGCRoadToTIUseItemResponse: MessageFns<CMsgClientToGCRoadToTIUseItemResponse>;
export declare const CMsgClientToGCRoadToTIDevForceQuest: MessageFns<CMsgClientToGCRoadToTIDevForceQuest>;
export declare const CMsgLobbyRoadToTIMatchQuestData: MessageFns<CMsgLobbyRoadToTIMatchQuestData>;
export declare const CMsgClientToGCNewBloomGift: MessageFns<CMsgClientToGCNewBloomGift>;
export declare const CMsgClientToGCNewBloomGiftResponse: MessageFns<CMsgClientToGCNewBloomGiftResponse>;
export declare const CMsgClientToGCSetBannedHeroes: MessageFns<CMsgClientToGCSetBannedHeroes>;
export declare const CMsgClientToGCUpdateComicBookStats: MessageFns<CMsgClientToGCUpdateComicBookStats>;
export declare const CMsgClientToGCUpdateComicBookStats_SingleStat: MessageFns<CMsgClientToGCUpdateComicBookStats_SingleStat>;
export declare const CMsgClientToGCUpdateComicBookStats_LanguageStats: MessageFns<CMsgClientToGCUpdateComicBookStats_LanguageStats>;
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
//# sourceMappingURL=dota_gcmessages_client.d.ts.map