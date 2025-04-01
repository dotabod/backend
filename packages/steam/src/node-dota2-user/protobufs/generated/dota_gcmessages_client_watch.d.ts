import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CMsgDOTAMatchMinimal } from "./dota_gcmessages_common";
export interface CSourceTVGameSmall {
    activateTime: number;
    deactivateTime: number;
    serverSteamId: string;
    lobbyId: string;
    leagueId: number;
    lobbyType: number;
    gameTime: number;
    delay: number;
    spectators: number;
    gameMode: number;
    averageMmr: number;
    matchId: string;
    seriesId: number;
    teamNameRadiant: string;
    teamNameDire: string;
    teamLogoRadiant: string;
    teamLogoDire: string;
    teamIdRadiant: number;
    teamIdDire: number;
    sortScore: number;
    lastUpdateTime: number;
    radiantLead: number;
    radiantScore: number;
    direScore: number;
    players: CSourceTVGameSmall_Player[];
    buildingState: number;
    weekendTourneyTournamentId: number;
    weekendTourneyDivision: number;
    weekendTourneySkillLevel: number;
    weekendTourneyBracketRound: number;
    customGameDifficulty: number;
}
export interface CSourceTVGameSmall_Player {
    accountId: number;
    heroId: number;
    teamSlot: number;
    team: number;
}
export interface CMsgClientToGCFindTopSourceTVGames {
    searchKey: string;
    leagueId: number;
    heroId: number;
    startGame: number;
    gameListIndex: number;
    lobbyIds: string[];
}
export interface CMsgGCToClientFindTopSourceTVGamesResponse {
    searchKey: string;
    leagueId: number;
    heroId: number;
    startGame: number;
    numGames: number;
    gameListIndex: number;
    gameList: CSourceTVGameSmall[];
    specificGames: boolean;
    botGame: CSourceTVGameSmall | undefined;
}
export interface CMsgGCToClientTopWeekendTourneyGames {
    liveGames: CSourceTVGameSmall[];
}
export interface CMsgClientToGCTopLeagueMatchesRequest {
}
export interface CMsgClientToGCTopFriendMatchesRequest {
}
export interface CMsgClientToGCMatchesMinimalRequest {
    matchIds: string[];
}
export interface CMsgClientToGCMatchesMinimalResponse {
    matches: CMsgDOTAMatchMinimal[];
    lastMatch: boolean;
}
export interface CMsgGCToClientTopLeagueMatchesResponse {
    matches: CMsgDOTAMatchMinimal[];
}
export interface CMsgGCToClientTopFriendMatchesResponse {
    matches: CMsgDOTAMatchMinimal[];
}
export interface CMsgSpectateFriendGame {
    steamId: string;
    live: boolean;
}
export interface CMsgSpectateFriendGameResponse {
    serverSteamid: string;
    watchLiveResult: CMsgSpectateFriendGameResponse_EWatchLiveResult;
}
export declare enum CMsgSpectateFriendGameResponse_EWatchLiveResult {
    SUCCESS = 0,
    ERROR_GENERIC = 1,
    ERROR_NO_PLUS = 2,
    ERROR_NOT_FRIENDS = 3,
    ERROR_LOBBY_NOT_FOUND = 4,
    ERROR_SPECTATOR_IN_A_LOBBY = 5,
    ERROR_LOBBY_IS_LAN = 6,
    ERROR_WRONG_LOBBY_TYPE = 7,
    ERROR_WRONG_LOBBY_STATE = 8,
    ERROR_PLAYER_NOT_PLAYER = 9,
    ERROR_TOO_MANY_SPECTATORS = 10,
    ERROR_SPECTATOR_SWITCHED_TEAMS = 11,
    ERROR_FRIENDS_ON_BOTH_SIDES = 12,
    ERROR_SPECTATOR_IN_THIS_LOBBY = 13,
    ERROR_LOBBY_IS_LEAGUE = 14
}
export declare function cMsgSpectateFriendGameResponse_EWatchLiveResultFromJSON(object: any): CMsgSpectateFriendGameResponse_EWatchLiveResult;
export declare function cMsgSpectateFriendGameResponse_EWatchLiveResultToJSON(object: CMsgSpectateFriendGameResponse_EWatchLiveResult): string;
export interface CDOTAReplayDownloadInfo {
    match: CMsgDOTAMatchMinimal | undefined;
    title: string;
    description: string;
    size: number;
    tags: string[];
    existsOnDisk: boolean;
}
export interface CDOTAReplayDownloadInfo_Highlight {
    timestamp: number;
    description: string;
}
export interface CMsgWatchGame {
    serverSteamid: string;
    clientVersion: number;
    watchServerSteamid: string;
    lobbyId: string;
    regions: number[];
}
export interface CMsgCancelWatchGame {
}
export interface CMsgWatchGameResponse {
    watchGameResult: CMsgWatchGameResponse_WatchGameResult;
    sourceTvPublicAddr: number;
    sourceTvPrivateAddr: number;
    sourceTvPort: number;
    gameServerSteamid: string;
    watchServerSteamid: string;
    watchTvUniqueSecretCode: string;
}
export declare enum CMsgWatchGameResponse_WatchGameResult {
    PENDING = 0,
    READY = 1,
    GAMESERVERNOTFOUND = 2,
    UNAVAILABLE = 3,
    CANCELLED = 4,
    INCOMPATIBLEVERSION = 5,
    MISSINGLEAGUESUBSCRIPTION = 6,
    LOBBYNOTFOUND = 7
}
export declare function cMsgWatchGameResponse_WatchGameResultFromJSON(object: any): CMsgWatchGameResponse_WatchGameResult;
export declare function cMsgWatchGameResponse_WatchGameResultToJSON(object: CMsgWatchGameResponse_WatchGameResult): string;
export interface CMsgPartyLeaderWatchGamePrompt {
    gameServerSteamid: string;
}
export interface CDOTABroadcasterInfo {
    accountId: number;
    serverSteamId: string;
    live: boolean;
    teamNameRadiant: string;
    teamNameDire: string;
    seriesGame: number;
    upcomingBroadcastTimestamp: number;
    allowLiveVideo: boolean;
    nodeType: number;
    nodeName: string;
}
export interface CMsgDOTASeries {
    seriesId: number;
    seriesType: number;
    team1: CMsgDOTASeries_TeamInfo | undefined;
    team2: CMsgDOTASeries_TeamInfo | undefined;
    matchMinimal: CMsgDOTAMatchMinimal[];
    liveGame: CMsgDOTASeries_LiveGame | undefined;
}
export interface CMsgDOTASeries_TeamInfo {
    teamId: number;
    teamName: string;
    teamLogoUrl: string;
    wagerCount: number;
}
export interface CMsgDOTASeries_LiveGame {
    serverSteamId: string;
    teamRadiant: CMsgDOTASeries_TeamInfo | undefined;
    teamDire: CMsgDOTASeries_TeamInfo | undefined;
    teamRadiantScore: number;
    teamDireScore: number;
}
export declare const CSourceTVGameSmall: MessageFns<CSourceTVGameSmall>;
export declare const CSourceTVGameSmall_Player: MessageFns<CSourceTVGameSmall_Player>;
export declare const CMsgClientToGCFindTopSourceTVGames: MessageFns<CMsgClientToGCFindTopSourceTVGames>;
export declare const CMsgGCToClientFindTopSourceTVGamesResponse: MessageFns<CMsgGCToClientFindTopSourceTVGamesResponse>;
export declare const CMsgGCToClientTopWeekendTourneyGames: MessageFns<CMsgGCToClientTopWeekendTourneyGames>;
export declare const CMsgClientToGCTopLeagueMatchesRequest: MessageFns<CMsgClientToGCTopLeagueMatchesRequest>;
export declare const CMsgClientToGCTopFriendMatchesRequest: MessageFns<CMsgClientToGCTopFriendMatchesRequest>;
export declare const CMsgClientToGCMatchesMinimalRequest: MessageFns<CMsgClientToGCMatchesMinimalRequest>;
export declare const CMsgClientToGCMatchesMinimalResponse: MessageFns<CMsgClientToGCMatchesMinimalResponse>;
export declare const CMsgGCToClientTopLeagueMatchesResponse: MessageFns<CMsgGCToClientTopLeagueMatchesResponse>;
export declare const CMsgGCToClientTopFriendMatchesResponse: MessageFns<CMsgGCToClientTopFriendMatchesResponse>;
export declare const CMsgSpectateFriendGame: MessageFns<CMsgSpectateFriendGame>;
export declare const CMsgSpectateFriendGameResponse: MessageFns<CMsgSpectateFriendGameResponse>;
export declare const CDOTAReplayDownloadInfo: MessageFns<CDOTAReplayDownloadInfo>;
export declare const CDOTAReplayDownloadInfo_Highlight: MessageFns<CDOTAReplayDownloadInfo_Highlight>;
export declare const CMsgWatchGame: MessageFns<CMsgWatchGame>;
export declare const CMsgCancelWatchGame: MessageFns<CMsgCancelWatchGame>;
export declare const CMsgWatchGameResponse: MessageFns<CMsgWatchGameResponse>;
export declare const CMsgPartyLeaderWatchGamePrompt: MessageFns<CMsgPartyLeaderWatchGamePrompt>;
export declare const CDOTABroadcasterInfo: MessageFns<CDOTABroadcasterInfo>;
export declare const CMsgDOTASeries: MessageFns<CMsgDOTASeries>;
export declare const CMsgDOTASeries_TeamInfo: MessageFns<CMsgDOTASeries_TeamInfo>;
export declare const CMsgDOTASeries_LiveGame: MessageFns<CMsgDOTASeries_LiveGame>;
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
//# sourceMappingURL=dota_gcmessages_client_watch.d.ts.map