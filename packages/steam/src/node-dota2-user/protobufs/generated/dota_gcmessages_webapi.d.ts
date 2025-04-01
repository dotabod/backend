import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CMsgDOTAMatch } from "./dota_gcmessages_common";
import { CDOTAMatchMetadata } from "./dota_match_metadata";
import { ELeagueDivision, ELeagueRegion } from "./dota_shared_enums";
export declare enum ETeamFanContentStatus {
    TEAM_FAN_CONTENT_STATUS_INVALID = 0,
    TEAM_FAN_CONTENT_STATUS_PENDING = 1,
    TEAM_FAN_CONTENT_STATUS_EVALUATED = 2
}
export declare function eTeamFanContentStatusFromJSON(object: any): ETeamFanContentStatus;
export declare function eTeamFanContentStatusToJSON(object: ETeamFanContentStatus): string;
export declare enum ETeamFanContentAssetType {
    k_eFanContentAssetType_LogoPNG = 1,
    k_eFanContentAssetType_LogoSVG = 2,
    k_eFanContentAssetType_Logo3D = 3,
    k_eFanContentAssetType_Players = 4,
    k_eFanContentAssetType_Sprays = 5,
    k_eFanContentAssetType_Wallpapers = 6,
    k_eFanContentAssetType_Emoticons = 7,
    k_eFanContentAssetType_VoiceLines = 8,
    k_eFanContentAssetType_Localization = 9
}
export declare function eTeamFanContentAssetTypeFromJSON(object: any): ETeamFanContentAssetType;
export declare function eTeamFanContentAssetTypeToJSON(object: ETeamFanContentAssetType): string;
export declare enum ETeamFanContentAssetStatus {
    k_eFanContentAssetStatus_None = 0,
    k_eFanContentAssetStatus_Approved = 1,
    k_eFanContentAssetStatus_Rejected = 2
}
export declare function eTeamFanContentAssetStatusFromJSON(object: any): ETeamFanContentAssetStatus;
export declare function eTeamFanContentAssetStatusToJSON(object: ETeamFanContentAssetStatus): string;
export declare enum ETalentContentStatus {
    TALENT_CONTENT_STATUS_INVALID = 0,
    TALENT_CONTENT_STATUS_PENDING = 1,
    TALENT_CONTENT_STATUS_EVALUATED = 2
}
export declare function eTalentContentStatusFromJSON(object: any): ETalentContentStatus;
export declare function eTalentContentStatusToJSON(object: ETalentContentStatus): string;
export declare enum ETalentContentAssetType {
    k_eTalentContentAssetType_Photo = 1,
    k_eTalentContentAssetType_Autograph = 2,
    k_eTalentContentAssetType_Voicelines = 3
}
export declare function eTalentContentAssetTypeFromJSON(object: any): ETalentContentAssetType;
export declare function eTalentContentAssetTypeToJSON(object: ETalentContentAssetType): string;
export declare enum ETalentContentAssetStatus {
    k_eTalentContentAssetStatus_None = 0,
    k_eTalentContentAssetStatus_Approved = 1,
    k_eTalentContentAssetStatus_Rejected = 2
}
export declare function eTalentContentAssetStatusFromJSON(object: any): ETalentContentAssetStatus;
export declare function eTalentContentAssetStatusToJSON(object: ETalentContentAssetStatus): string;
export interface CMsgArcanaVotes {
    matches: CMsgArcanaVotes_Match[];
    roundTimeRemaining: number;
    roundNumber: number;
    votingState: number;
    isCurrentRoundCalibrating: boolean;
    closestActiveMatchId: number;
    eventId: number;
    votingStartTime: number;
}
export declare enum CMsgArcanaVotes_VotingState {
    FINISHED = 0,
    IN_PROGRESS = 1,
    IN_FUTURE = 2
}
export declare function cMsgArcanaVotes_VotingStateFromJSON(object: any): CMsgArcanaVotes_VotingState;
export declare function cMsgArcanaVotes_VotingStateToJSON(object: CMsgArcanaVotes_VotingState): string;
export interface CMsgArcanaVotes_Match {
    matchId: number;
    heroId0: number;
    heroId1: number;
    heroSeeding0: number;
    heroSeeding1: number;
    voteCount0: number;
    voteCount1: number;
    votingState: number;
    roundNumber: number;
    isVotesHidden: boolean;
    calibrationTimeRemaining: number;
}
export interface CMsgDOTADPCFeed {
    elements: CMsgDOTADPCFeed_Element[];
}
export declare enum CMsgDOTADPCFeed_EFeedElementType {
    FEED_SERIES_RESULT = 1,
    FEED_MATCH_POPULAR = 2,
    FEED_TEAM_UPCOMING_MATCH = 3,
    FEED_TEAM_LEAGUE_RESULT = 4,
    FEED_TEAM_ADD_PLAYER = 5,
    FEED_TEAM_REMOVE_PLAYER = 6,
    FEED_TEAM_DISBAND = 7,
    FEED_LEAGUE_UPCOMING = 8,
    FEED_LEAGUE_CONCLUDED = 9,
    FEED_DPC_STANDINGS = 10,
    FEED_ALERT_PREDICTIONS = 11,
    FEED_ALERT_FANTASY = 12,
    FEED_LEAGUE_LIVE_MATCH = 13,
    FEED_LEAGUE_INPROGRESS_SERIES = 14
}
export declare function cMsgDOTADPCFeed_EFeedElementTypeFromJSON(object: any): CMsgDOTADPCFeed_EFeedElementType;
export declare function cMsgDOTADPCFeed_EFeedElementTypeToJSON(object: CMsgDOTADPCFeed_EFeedElementType): string;
export interface CMsgDOTADPCFeed_Element {
    type: CMsgDOTADPCFeed_EFeedElementType;
    timestamp: number;
    seriesId: number;
    matchId: string;
    teamId: number;
    accountId: number;
    leagueId: number;
    nodeId: number;
    serverSteamId: string;
    data1: number;
    data2: number;
    data3: number;
    data4: number;
}
export interface CMsgDOTADPCUserInfo {
    isPlusSubscriber: boolean;
}
export interface CMsgDraftTrivia {
    hasValidMatch: boolean;
    matchHeroInfo: CMsgDraftTrivia_DraftTriviaMatchInfo | undefined;
    matchRankTier: number;
    endTime: number;
    eventId: number;
    currentMatchVotedRadiant: boolean;
    previousResult: CMsgDraftTrivia_PreviousResult | undefined;
    currentStreak: number;
}
export interface CMsgDraftTrivia_DraftTriviaHeroInfo {
    heroId: number;
    role: number;
}
export interface CMsgDraftTrivia_DraftTriviaMatchInfo {
    radiantHeroes: CMsgDraftTrivia_DraftTriviaHeroInfo[];
    direHeroes: CMsgDraftTrivia_DraftTriviaHeroInfo[];
}
export interface CMsgDraftTrivia_PreviousResult {
    votedCorrectly: boolean;
    votedRadiant: boolean;
    matchHeroInfo: CMsgDraftTrivia_DraftTriviaMatchInfo | undefined;
    matchRankTier: number;
    endTime: number;
    matchId: string;
}
export interface CMsgTeamFanContentAssetStatus {
    assetType: ETeamFanContentAssetType;
    assetIndex: number;
    assetStatus: ETeamFanContentAssetStatus;
    crc: number;
}
export interface CMsgTeamFanContentAssetStatusResponse {
    result: CMsgTeamFanContentAssetStatusResponse_EResult;
}
export declare enum CMsgTeamFanContentAssetStatusResponse_EResult {
    k_eSuccess = 0,
    k_eInternalError = 1
}
export declare function cMsgTeamFanContentAssetStatusResponse_EResultFromJSON(object: any): CMsgTeamFanContentAssetStatusResponse_EResult;
export declare function cMsgTeamFanContentAssetStatusResponse_EResultToJSON(object: CMsgTeamFanContentAssetStatusResponse_EResult): string;
export interface CMsgTeamFanContentStatus {
    teamStatusList: CMsgTeamFanContentStatus_TeamStatus[];
}
export interface CMsgTeamFanContentStatus_TeamStatus {
    name: string;
    teamId: number;
    logoUrl: string;
    status: ETeamFanContentStatus;
    timestamp: number;
    ugcLogo: string;
    workshopAccountId: number;
    abbreviation: string;
    voicelineCount: number;
    sprayCount: number;
    emoticonCount: number;
    wallpaperCount: number;
    comment: string;
    commentTimestamp: number;
    assetStatus: CMsgTeamFanContentAssetStatus[];
    emailTimestamp: number;
    emailTier: number;
    languages: string;
}
export interface CMsgTeamFanContentAutographStatus {
    teamAutographs: CMsgTeamFanContentAutographStatus_TeamStatus[];
}
export interface CMsgTeamFanContentAutographStatus_AutographStatus {
    proName: string;
    accountId: number;
    timestamp: number;
    file: string;
}
export interface CMsgTeamFanContentAutographStatus_TeamStatus {
    name: string;
    teamId: number;
    autographs: CMsgTeamFanContentAutographStatus_AutographStatus[];
    workshopAccountId: number;
}
export interface CMsgTalentContentAssetStatus {
    assetType: ETalentContentAssetType;
    assetIndex: number;
    assetStatus: ETalentContentAssetStatus;
}
export interface CMsgTalentContentStatus {
    talentStatus: CMsgTalentContentStatus_TalentDetails[];
}
export interface CMsgTalentContentStatus_TalentDetails {
    accountId: number;
    fullName: string;
    nickname: string;
    workshopItemId: number;
    zipFile: string;
    status: ETalentContentStatus;
    assetStatus: CMsgTalentContentAssetStatus[];
    broadcastLanguage: number;
}
export interface CMsgSetTalentContentResponse {
    result: CMsgSetTalentContentResponse_EResult;
}
export declare enum CMsgSetTalentContentResponse_EResult {
    k_eSuccess = 0,
    k_eInternalError = 1
}
export declare function cMsgSetTalentContentResponse_EResultFromJSON(object: any): CMsgSetTalentContentResponse_EResult;
export declare function cMsgSetTalentContentResponse_EResultToJSON(object: CMsgSetTalentContentResponse_EResult): string;
export interface CMsgDPCEvent {
    event: CMsgDPCEvent_ELeagueEvent;
    eventType: CMsgDPCEvent_ELeagueEventType;
    leagues: CMsgDPCEvent_League[];
    registrationPeriod: number;
    isEventUpcoming: boolean;
    isEventCompleted: boolean;
    eventName: string;
    multicastLeagueId: number;
    multicastStreams: number[];
    tour: CMsgDPCEvent_ETour;
    timestampDropLock: number;
    timestampAddLock: number;
    timestampContentDeadline: number;
    isFantasyEnabled: boolean;
    timestampContentReviewDeadline: number;
}
export declare enum CMsgDPCEvent_ELeagueEvent {
    EVENT_INVALID = 0,
    SPRING_2021_LEAGUE = 1,
    SPRING_2021_MAJOR = 2,
    INTERNATIONAL_2021_QUALIFIERS = 3,
    INTERNATIONAL_2021 = 4,
    WINTER_2021_LEAGUE = 5,
    WINTER_2021_LEAGUE_FINALS = 6,
    SPRING_2022_LEAGUE = 7,
    SPRING_2022_MAJOR = 8,
    SUMMER_2022_LEAGUE = 9,
    SUMMER_2022_MAJOR = 10,
    INTERNATIONAL_2022 = 11,
    CHINA_REGIONAL_FINALS = 12,
    INTERNATIONAL_2022_REGIONAL_QUALIFIERS = 13,
    INTERNATIONAL_2022_LAST_CHANCE_QUALIFIERS = 14,
    WINTER_2023_LEAGUE = 15,
    WINTER_2023_MAJOR = 16,
    SPRING_2023_LEAGUE = 17,
    SPRING_2023_MAJOR = 18,
    SUMMER_2023_LEAGUE = 19,
    SUMMER_2023_MAJOR = 20,
    INTERNATIONAL_2023 = 21,
    INTERNATIONAL_2024 = 23
}
export declare function cMsgDPCEvent_ELeagueEventFromJSON(object: any): CMsgDPCEvent_ELeagueEvent;
export declare function cMsgDPCEvent_ELeagueEventToJSON(object: CMsgDPCEvent_ELeagueEvent): string;
export declare enum CMsgDPCEvent_ELeagueEventPhase {
    PHASE_INVALID = 0,
    WILD_CARD = 1,
    GROUP_STAGE = 2,
    GROUP_A = 3,
    GROUP_B = 4,
    OVERALL = 5,
    PLAYOFF = 6,
    RESULTS = 7,
    DPC_POINT_STANDINGS = 8,
    GROUP_C = 9,
    GROUP_D = 10,
    PLACEMENT = 11
}
export declare function cMsgDPCEvent_ELeagueEventPhaseFromJSON(object: any): CMsgDPCEvent_ELeagueEventPhase;
export declare function cMsgDPCEvent_ELeagueEventPhaseToJSON(object: CMsgDPCEvent_ELeagueEventPhase): string;
export declare enum CMsgDPCEvent_ELeagueEventType {
    UNKNOWN = 0,
    LEAGUE = 1,
    MAJOR = 2,
    INTERNATIONAL_QUALIFIERS = 3,
    INTERNATIONAL = 4,
    LEAGUE_FINALS = 5,
    EXTERNAL = 6
}
export declare function cMsgDPCEvent_ELeagueEventTypeFromJSON(object: any): CMsgDPCEvent_ELeagueEventType;
export declare function cMsgDPCEvent_ELeagueEventTypeToJSON(object: CMsgDPCEvent_ELeagueEventType): string;
export declare enum CMsgDPCEvent_ETour {
    TOUR_NONE = 0,
    TOUR_1 = 1,
    TOUR_2 = 2,
    TOUR_3 = 3
}
export declare function cMsgDPCEvent_ETourFromJSON(object: any): CMsgDPCEvent_ETour;
export declare function cMsgDPCEvent_ETourToJSON(object: CMsgDPCEvent_ETour): string;
export interface CMsgDPCEvent_PhaseInfo {
    phase: CMsgDPCEvent_ELeagueEventPhase;
    nodeGroupId: number;
}
export interface CMsgDPCEvent_League {
    region: ELeagueRegion;
    division: ELeagueDivision;
    leagueId: number;
    phases: CMsgDPCEvent_PhaseInfo[];
}
export interface CMsgDPCEventList {
    events: CMsgDPCEvent[];
}
export interface CMsgDOTAFantasyCardLineup {
    periods: CMsgDOTAFantasyCardLineup_Period[];
}
export interface CMsgDOTAFantasyCardLineup_CardBonus {
    bonusStat: number;
    bonusValue: number;
}
export interface CMsgDOTAFantasyCardLineup_Card {
    playerAccountId: number;
    playerName: string;
    teamId: number;
    teamName: string;
    role: number;
    bonuses: CMsgDOTAFantasyCardLineup_CardBonus[];
    score: number;
    finalized: boolean;
    itemId: string;
}
export interface CMsgDOTAFantasyCardLineup_League {
    leagueId: number;
    cards: CMsgDOTAFantasyCardLineup_Card[];
    score: number;
}
export interface CMsgDOTAFantasyCardLineup_Period {
    fantasyPeriod: number;
    timestampStart: number;
    timestampEnd: number;
    leagues: CMsgDOTAFantasyCardLineup_League[];
}
export interface CMsgDOTAFantasyCardList {
    cards: CMsgDOTAFantasyCardList_Card[];
}
export interface CMsgDOTAFantasyCardList_CardBonus {
    bonusStat: number;
    bonusValue: number;
}
export interface CMsgDOTAFantasyCardList_Card {
    playerAccountId: number;
    playerName: string;
    teamId: number;
    teamName: string;
    role: number;
    bonuses: CMsgDOTAFantasyCardList_CardBonus[];
    itemId: string;
}
export interface CMsgChatToxicityToxicPlayerMatchesReport {
    rows: CMsgChatToxicityToxicPlayerMatchesReport_IndividualRow[];
}
export interface CMsgChatToxicityToxicPlayerMatchesReport_IndividualRow {
    playerAccountId: number;
    numMatchesSeen: number;
    numMessages: number;
    numMessagesToxic: number;
    firstMatchSeen: string;
    lastMatchSeen: string;
}
export interface CMsgChatToxicityReport {
    numMatchesSeen: number;
    numMessages: number;
    numMessagesMlThinksToxic: number;
    status: string;
    result: number;
    message: string;
}
export interface CMsgGetTeamAuditInformation {
    teamId: number;
    teamName: string;
    actions: CMsgGetTeamAuditInformation_Action[];
    lastUpdated: number;
}
export interface CMsgGetTeamAuditInformation_Action {
    registrationPeriod: number;
    accountId: number;
    action: number;
    timestamp: number;
    playerName: string;
    playerRealName: string;
}
export interface CMsgDOTADPCMatch {
    match: CMsgDOTAMatch | undefined;
    metadata: CDOTAMatchMetadata | undefined;
}
export declare const CMsgArcanaVotes: MessageFns<CMsgArcanaVotes>;
export declare const CMsgArcanaVotes_Match: MessageFns<CMsgArcanaVotes_Match>;
export declare const CMsgDOTADPCFeed: MessageFns<CMsgDOTADPCFeed>;
export declare const CMsgDOTADPCFeed_Element: MessageFns<CMsgDOTADPCFeed_Element>;
export declare const CMsgDOTADPCUserInfo: MessageFns<CMsgDOTADPCUserInfo>;
export declare const CMsgDraftTrivia: MessageFns<CMsgDraftTrivia>;
export declare const CMsgDraftTrivia_DraftTriviaHeroInfo: MessageFns<CMsgDraftTrivia_DraftTriviaHeroInfo>;
export declare const CMsgDraftTrivia_DraftTriviaMatchInfo: MessageFns<CMsgDraftTrivia_DraftTriviaMatchInfo>;
export declare const CMsgDraftTrivia_PreviousResult: MessageFns<CMsgDraftTrivia_PreviousResult>;
export declare const CMsgTeamFanContentAssetStatus: MessageFns<CMsgTeamFanContentAssetStatus>;
export declare const CMsgTeamFanContentAssetStatusResponse: MessageFns<CMsgTeamFanContentAssetStatusResponse>;
export declare const CMsgTeamFanContentStatus: MessageFns<CMsgTeamFanContentStatus>;
export declare const CMsgTeamFanContentStatus_TeamStatus: MessageFns<CMsgTeamFanContentStatus_TeamStatus>;
export declare const CMsgTeamFanContentAutographStatus: MessageFns<CMsgTeamFanContentAutographStatus>;
export declare const CMsgTeamFanContentAutographStatus_AutographStatus: MessageFns<CMsgTeamFanContentAutographStatus_AutographStatus>;
export declare const CMsgTeamFanContentAutographStatus_TeamStatus: MessageFns<CMsgTeamFanContentAutographStatus_TeamStatus>;
export declare const CMsgTalentContentAssetStatus: MessageFns<CMsgTalentContentAssetStatus>;
export declare const CMsgTalentContentStatus: MessageFns<CMsgTalentContentStatus>;
export declare const CMsgTalentContentStatus_TalentDetails: MessageFns<CMsgTalentContentStatus_TalentDetails>;
export declare const CMsgSetTalentContentResponse: MessageFns<CMsgSetTalentContentResponse>;
export declare const CMsgDPCEvent: MessageFns<CMsgDPCEvent>;
export declare const CMsgDPCEvent_PhaseInfo: MessageFns<CMsgDPCEvent_PhaseInfo>;
export declare const CMsgDPCEvent_League: MessageFns<CMsgDPCEvent_League>;
export declare const CMsgDPCEventList: MessageFns<CMsgDPCEventList>;
export declare const CMsgDOTAFantasyCardLineup: MessageFns<CMsgDOTAFantasyCardLineup>;
export declare const CMsgDOTAFantasyCardLineup_CardBonus: MessageFns<CMsgDOTAFantasyCardLineup_CardBonus>;
export declare const CMsgDOTAFantasyCardLineup_Card: MessageFns<CMsgDOTAFantasyCardLineup_Card>;
export declare const CMsgDOTAFantasyCardLineup_League: MessageFns<CMsgDOTAFantasyCardLineup_League>;
export declare const CMsgDOTAFantasyCardLineup_Period: MessageFns<CMsgDOTAFantasyCardLineup_Period>;
export declare const CMsgDOTAFantasyCardList: MessageFns<CMsgDOTAFantasyCardList>;
export declare const CMsgDOTAFantasyCardList_CardBonus: MessageFns<CMsgDOTAFantasyCardList_CardBonus>;
export declare const CMsgDOTAFantasyCardList_Card: MessageFns<CMsgDOTAFantasyCardList_Card>;
export declare const CMsgChatToxicityToxicPlayerMatchesReport: MessageFns<CMsgChatToxicityToxicPlayerMatchesReport>;
export declare const CMsgChatToxicityToxicPlayerMatchesReport_IndividualRow: MessageFns<CMsgChatToxicityToxicPlayerMatchesReport_IndividualRow>;
export declare const CMsgChatToxicityReport: MessageFns<CMsgChatToxicityReport>;
export declare const CMsgGetTeamAuditInformation: MessageFns<CMsgGetTeamAuditInformation>;
export declare const CMsgGetTeamAuditInformation_Action: MessageFns<CMsgGetTeamAuditInformation_Action>;
export declare const CMsgDOTADPCMatch: MessageFns<CMsgDOTADPCMatch>;
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
//# sourceMappingURL=dota_gcmessages_webapi.d.ts.map