import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CGCSystemMsgGetAccountDetailsResponse } from "./steammessages";
import { CMsgSteamLearnAccessTokens } from "./steammessages_steamlearn.steamworkssdk";
export declare enum ESourceEngine {
    k_ESE_Source1 = 0,
    k_ESE_Source2 = 1
}
export declare function eSourceEngineFromJSON(object: any): ESourceEngine;
export declare function eSourceEngineToJSON(object: ESourceEngine): string;
export declare enum PartnerAccountType {
    PARTNER_NONE = 0,
    PARTNER_PERFECT_WORLD = 1,
    PARTNER_INVALID = 3
}
export declare function partnerAccountTypeFromJSON(object: any): PartnerAccountType;
export declare function partnerAccountTypeToJSON(object: PartnerAccountType): string;
export declare enum GCConnectionStatus {
    GCConnectionStatus_HAVE_SESSION = 0,
    GCConnectionStatus_GC_GOING_DOWN = 1,
    GCConnectionStatus_NO_SESSION = 2,
    GCConnectionStatus_NO_SESSION_IN_LOGON_QUEUE = 3,
    GCConnectionStatus_NO_STEAM = 4,
    GCConnectionStatus_SUSPENDED = 5,
    GCConnectionStatus_STEAM_GOING_DOWN = 6
}
export declare function gCConnectionStatusFromJSON(object: any): GCConnectionStatus;
export declare function gCConnectionStatusToJSON(object: GCConnectionStatus): string;
export interface CExtraMsgBlock {
    msgType: number;
    contents: Buffer;
    msgKey: string;
    isCompressed: boolean;
}
export interface CMsgSteamLearnServerInfo {
    accessTokens: CMsgSteamLearnAccessTokens | undefined;
    projectInfos: CMsgSteamLearnServerInfo_ProjectInfo[];
}
export interface CMsgSteamLearnServerInfo_ProjectInfo {
    projectId: number;
    snapshotPublishedVersion: number;
    inferencePublishedVersion: number;
    snapshotPercentage: number;
    snapshotEnabled: boolean;
}
export interface CMsgGCAssertJobData {
    messageType: string;
    messageData: Buffer;
}
export interface CMsgGCConCommand {
    command: string;
}
export interface CMsgSDOAssert {
    sdoType: number;
    requests: CMsgSDOAssert_Request[];
}
export interface CMsgSDOAssert_Request {
    key: string[];
    requestingJob: string;
}
export interface CMsgSOIDOwner {
    type: number;
    id: string;
}
export interface CMsgSOSingleObject {
    typeId: number;
    objectData: Buffer;
    version: string;
    ownerSoid: CMsgSOIDOwner | undefined;
    serviceId: number;
}
export interface CMsgSOMultipleObjects {
    objectsModified: CMsgSOMultipleObjects_SingleObject[];
    version: string;
    objectsAdded: CMsgSOMultipleObjects_SingleObject[];
    objectsRemoved: CMsgSOMultipleObjects_SingleObject[];
    ownerSoid: CMsgSOIDOwner | undefined;
    serviceId: number;
}
export interface CMsgSOMultipleObjects_SingleObject {
    typeId: number;
    objectData: Buffer;
}
export interface CMsgSOCacheSubscribed {
    objects: CMsgSOCacheSubscribed_SubscribedType[];
    version: string;
    ownerSoid: CMsgSOIDOwner | undefined;
    serviceId: number;
    serviceList: number[];
    syncVersion: string;
}
export interface CMsgSOCacheSubscribed_SubscribedType {
    typeId: number;
    objectData: Buffer[];
}
export interface CMsgSOCacheSubscribedUpToDate {
    version: string;
    ownerSoid: CMsgSOIDOwner | undefined;
    serviceId: number;
    serviceList: number[];
    syncVersion: string;
}
export interface CMsgSOCacheUnsubscribed {
    ownerSoid: CMsgSOIDOwner | undefined;
}
export interface CMsgSOCacheSubscriptionCheck {
    version: string;
    ownerSoid: CMsgSOIDOwner | undefined;
    serviceId: number;
    serviceList: number[];
    syncVersion: string;
}
export interface CMsgSOCacheSubscriptionRefresh {
    ownerSoid: CMsgSOIDOwner | undefined;
}
export interface CMsgSOCacheVersion {
    version: string;
}
export interface CMsgGCMultiplexMessage {
    msgtype: number;
    payload: Buffer;
    steamids: string[];
}
export interface CMsgGCToGCSubGCStarting {
    dirIndex: number;
}
export interface CGCToGCMsgMasterAck {
    dirIndex: number;
    machineName: string;
    processName: string;
    directory: CGCToGCMsgMasterAck_Process[];
}
export interface CGCToGCMsgMasterAck_Process {
    dirIndex: number;
    typeInstances: number[];
}
export interface CGCToGCMsgMasterAckResponse {
    eresult: number;
}
export interface CMsgGCToGCUniverseStartup {
    isInitialStartup: boolean;
}
export interface CMsgGCToGCUniverseStartupResponse {
    eresult: number;
}
export interface CGCToGCMsgMasterStartupComplete {
    gcInfo: CGCToGCMsgMasterStartupComplete_GCInfo[];
}
export interface CGCToGCMsgMasterStartupComplete_GCInfo {
    dirIndex: number;
    machineName: string;
}
export interface CGCToGCMsgRouted {
    msgType: number;
    senderId: string;
    netMessage: Buffer;
}
export interface CGCToGCMsgRoutedReply {
    msgType: number;
    netMessage: Buffer;
}
export interface CMsgGCUpdateSubGCSessionInfo {
    updates: CMsgGCUpdateSubGCSessionInfo_CMsgUpdate[];
}
export interface CMsgGCUpdateSubGCSessionInfo_CMsgUpdate {
    steamid: string;
    ip: number;
    trusted: boolean;
}
export interface CMsgGCRequestSubGCSessionInfo {
    steamid: string;
}
export interface CMsgGCRequestSubGCSessionInfoResponse {
    ip: number;
    trusted: boolean;
    port: number;
    success: boolean;
}
export interface CMsgSOCacheHaveVersion {
    soid: CMsgSOIDOwner | undefined;
    version: string;
    serviceId: number;
    cachedFileVersion: number;
}
export interface CMsgClientHello {
    version: number;
    socacheHaveVersions: CMsgSOCacheHaveVersion[];
    clientSessionNeed: number;
    clientLauncher: PartnerAccountType;
    secretKey: string;
    clientLanguage: number;
    engine: ESourceEngine;
    steamdatagramLogin: Buffer;
    platformId: number;
    gameMsg: Buffer;
    osType: number;
    renderSystem: number;
    renderSystemReq: number;
    screenWidth: number;
    screenHeight: number;
    screenRefresh: number;
    renderWidth: number;
    renderHeight: number;
    swapWidth: number;
    swapHeight: number;
    isSteamChina: boolean;
    isSteamChinaClient: boolean;
    platformName: string;
}
export interface CMsgClientWelcome {
    version: number;
    gameData: Buffer;
    outofdateSubscribedCaches: CMsgSOCacheSubscribed[];
    uptodateSubscribedCaches: CMsgSOCacheSubscriptionCheck[];
    location: CMsgClientWelcome_Location | undefined;
    gcSocacheFileVersion: number;
    txnCountryCode: string;
    gameData2: Buffer;
    rtime32GcWelcomeTimestamp: number;
    currency: number;
    balance: number;
    balanceUrl: string;
    hasAcceptedChinaSsa: boolean;
    isBannedSteamChina: boolean;
    additionalWelcomeMsgs: CExtraMsgBlock | undefined;
    steamLearnServerInfo: CMsgSteamLearnServerInfo | undefined;
}
export interface CMsgClientWelcome_Location {
    latitude: number;
    longitude: number;
    country: string;
}
export interface CMsgConnectionStatus {
    status: GCConnectionStatus;
    clientSessionNeed: number;
    queuePosition: number;
    queueSize: number;
    waitSeconds: number;
    estimatedWaitSecondsRemaining: number;
}
export interface CMsgGCToGCSOCacheSubscribe {
    subscriber: string;
    subscribeToId: string;
    syncVersion: string;
    haveVersions: CMsgGCToGCSOCacheSubscribe_CMsgHaveVersions[];
    subscribeToType: number;
}
export interface CMsgGCToGCSOCacheSubscribe_CMsgHaveVersions {
    serviceId: number;
    version: string;
}
export interface CMsgGCToGCSOCacheUnsubscribe {
    subscriber: string;
    unsubscribeFromId: string;
    unsubscribeFromType: number;
}
export interface CMsgGCClientPing {
}
export interface CMsgGCToGCForwardAccountDetails {
    steamid: string;
    accountDetails: CGCSystemMsgGetAccountDetailsResponse | undefined;
    ageSeconds: number;
}
export interface CMsgGCToGCLoadSessionSOCache {
    accountId: number;
    forwardAccountDetails: CMsgGCToGCForwardAccountDetails | undefined;
}
export interface CMsgGCToGCLoadSessionSOCacheResponse {
}
export interface CMsgGCToGCUpdateSessionStats {
    userSessions: number;
    serverSessions: number;
    inLogonSurge: boolean;
}
export interface CMsgGCToClientRequestDropped {
}
export interface CWorkshopPopulateItemDescriptionsRequest {
    appid: number;
    languages: CWorkshopPopulateItemDescriptionsRequest_ItemDescriptionsLanguageBlock[];
}
export interface CWorkshopPopulateItemDescriptionsRequest_SingleItemDescription {
    gameitemid: number;
    itemDescription: string;
}
export interface CWorkshopPopulateItemDescriptionsRequest_ItemDescriptionsLanguageBlock {
    language: string;
    descriptions: CWorkshopPopulateItemDescriptionsRequest_SingleItemDescription[];
}
export interface CWorkshopGetContributorsRequest {
    appid: number;
    gameitemid: number;
}
export interface CWorkshopGetContributorsResponse {
    contributors: string[];
}
export interface CWorkshopSetItemPaymentRulesRequest {
    appid: number;
    gameitemid: number;
    associatedWorkshopFiles: CWorkshopSetItemPaymentRulesRequest_WorkshopItemPaymentRule[];
    partnerAccounts: CWorkshopSetItemPaymentRulesRequest_PartnerItemPaymentRule[];
    validateOnly: boolean;
    makeWorkshopFilesSubscribable: boolean;
    associatedWorkshopFileForDirectPayments: CWorkshopSetItemPaymentRulesRequest_WorkshopDirectPaymentRule | undefined;
}
export interface CWorkshopSetItemPaymentRulesRequest_WorkshopItemPaymentRule {
    workshopFileId: string;
    revenuePercentage: number;
    ruleDescription: string;
    ruleType: number;
}
export interface CWorkshopSetItemPaymentRulesRequest_WorkshopDirectPaymentRule {
    workshopFileId: string;
    ruleDescription: string;
}
export interface CWorkshopSetItemPaymentRulesRequest_PartnerItemPaymentRule {
    accountId: number;
    revenuePercentage: number;
    ruleDescription: string;
}
export interface CWorkshopSetItemPaymentRulesResponse {
    validationErrors: string[];
}
export interface CCommunityClanAnnouncementInfo {
    gid: string;
    clanid: string;
    posterid: string;
    headline: string;
    posttime: number;
    updatetime: number;
    body: string;
    commentcount: number;
    tags: string[];
    language: number;
    hidden: boolean;
    forumTopicId: string;
}
export interface CCommunityGetClanAnnouncementsRequest {
    steamid: string;
    offset: number;
    count: number;
    maxchars: number;
    stripHtml: boolean;
    requiredTags: string[];
    requireNoTags: boolean;
    languagePreference: number[];
    hiddenOnly: boolean;
    onlyGid: boolean;
    rtimeOldestDate: number;
    includeHidden: boolean;
    includePartnerEvents: boolean;
}
export interface CCommunityGetClanAnnouncementsResponse {
    maxchars: number;
    stripHtml: boolean;
    announcements: CCommunityClanAnnouncementInfo[];
}
export interface CBroadcastPostGameDataFrameRequest {
    appid: number;
    steamid: string;
    broadcastId: string;
    frameData: Buffer;
}
export interface CMsgSerializedSOCache {
    fileVersion: number;
    caches: CMsgSerializedSOCache_Cache[];
    gcSocacheFileVersion: number;
}
export interface CMsgSerializedSOCache_TypeCache {
    type: number;
    objects: Buffer[];
    serviceId: number;
}
export interface CMsgSerializedSOCache_Cache {
    type: number;
    id: string;
    versions: CMsgSerializedSOCache_Cache_Version[];
    typeCaches: CMsgSerializedSOCache_TypeCache[];
}
export interface CMsgSerializedSOCache_Cache_Version {
    service: number;
    version: string;
}
export interface CMsgGCToClientPollConvarRequest {
    convarName: string;
    pollId: number;
}
export interface CMsgGCToClientPollConvarResponse {
    pollId: number;
    convarValue: string;
}
export interface CGCMsgCompressedMsgToClient {
    msgId: number;
    compressedMsg: Buffer;
}
export interface CMsgGCToGCMasterBroadcastMessage {
    usersPerSecond: number;
    sendToUsers: boolean;
    sendToServers: boolean;
    msgId: number;
    msgData: Buffer;
}
export interface CMsgGCToGCMasterSubscribeToCache {
    soidType: number;
    soidId: string;
    accountIds: number[];
    steamIds: string[];
}
export interface CMsgGCToGCMasterSubscribeToCacheResponse {
}
export interface CMsgGCToGCMasterSubscribeToCacheAsync {
    subscribeMsg: CMsgGCToGCMasterSubscribeToCache | undefined;
}
export interface CMsgGCToGCMasterUnsubscribeFromCache {
    soidType: number;
    soidId: string;
    accountIds: number[];
    steamIds: string[];
}
export interface CMsgGCToGCMasterDestroyCache {
    soidType: number;
    soidId: string;
}
export declare const CExtraMsgBlock: MessageFns<CExtraMsgBlock>;
export declare const CMsgSteamLearnServerInfo: MessageFns<CMsgSteamLearnServerInfo>;
export declare const CMsgSteamLearnServerInfo_ProjectInfo: MessageFns<CMsgSteamLearnServerInfo_ProjectInfo>;
export declare const CMsgGCAssertJobData: MessageFns<CMsgGCAssertJobData>;
export declare const CMsgGCConCommand: MessageFns<CMsgGCConCommand>;
export declare const CMsgSDOAssert: MessageFns<CMsgSDOAssert>;
export declare const CMsgSDOAssert_Request: MessageFns<CMsgSDOAssert_Request>;
export declare const CMsgSOIDOwner: MessageFns<CMsgSOIDOwner>;
export declare const CMsgSOSingleObject: MessageFns<CMsgSOSingleObject>;
export declare const CMsgSOMultipleObjects: MessageFns<CMsgSOMultipleObjects>;
export declare const CMsgSOMultipleObjects_SingleObject: MessageFns<CMsgSOMultipleObjects_SingleObject>;
export declare const CMsgSOCacheSubscribed: MessageFns<CMsgSOCacheSubscribed>;
export declare const CMsgSOCacheSubscribed_SubscribedType: MessageFns<CMsgSOCacheSubscribed_SubscribedType>;
export declare const CMsgSOCacheSubscribedUpToDate: MessageFns<CMsgSOCacheSubscribedUpToDate>;
export declare const CMsgSOCacheUnsubscribed: MessageFns<CMsgSOCacheUnsubscribed>;
export declare const CMsgSOCacheSubscriptionCheck: MessageFns<CMsgSOCacheSubscriptionCheck>;
export declare const CMsgSOCacheSubscriptionRefresh: MessageFns<CMsgSOCacheSubscriptionRefresh>;
export declare const CMsgSOCacheVersion: MessageFns<CMsgSOCacheVersion>;
export declare const CMsgGCMultiplexMessage: MessageFns<CMsgGCMultiplexMessage>;
export declare const CMsgGCToGCSubGCStarting: MessageFns<CMsgGCToGCSubGCStarting>;
export declare const CGCToGCMsgMasterAck: MessageFns<CGCToGCMsgMasterAck>;
export declare const CGCToGCMsgMasterAck_Process: MessageFns<CGCToGCMsgMasterAck_Process>;
export declare const CGCToGCMsgMasterAckResponse: MessageFns<CGCToGCMsgMasterAckResponse>;
export declare const CMsgGCToGCUniverseStartup: MessageFns<CMsgGCToGCUniverseStartup>;
export declare const CMsgGCToGCUniverseStartupResponse: MessageFns<CMsgGCToGCUniverseStartupResponse>;
export declare const CGCToGCMsgMasterStartupComplete: MessageFns<CGCToGCMsgMasterStartupComplete>;
export declare const CGCToGCMsgMasterStartupComplete_GCInfo: MessageFns<CGCToGCMsgMasterStartupComplete_GCInfo>;
export declare const CGCToGCMsgRouted: MessageFns<CGCToGCMsgRouted>;
export declare const CGCToGCMsgRoutedReply: MessageFns<CGCToGCMsgRoutedReply>;
export declare const CMsgGCUpdateSubGCSessionInfo: MessageFns<CMsgGCUpdateSubGCSessionInfo>;
export declare const CMsgGCUpdateSubGCSessionInfo_CMsgUpdate: MessageFns<CMsgGCUpdateSubGCSessionInfo_CMsgUpdate>;
export declare const CMsgGCRequestSubGCSessionInfo: MessageFns<CMsgGCRequestSubGCSessionInfo>;
export declare const CMsgGCRequestSubGCSessionInfoResponse: MessageFns<CMsgGCRequestSubGCSessionInfoResponse>;
export declare const CMsgSOCacheHaveVersion: MessageFns<CMsgSOCacheHaveVersion>;
export declare const CMsgClientHello: MessageFns<CMsgClientHello>;
export declare const CMsgClientWelcome: MessageFns<CMsgClientWelcome>;
export declare const CMsgClientWelcome_Location: MessageFns<CMsgClientWelcome_Location>;
export declare const CMsgConnectionStatus: MessageFns<CMsgConnectionStatus>;
export declare const CMsgGCToGCSOCacheSubscribe: MessageFns<CMsgGCToGCSOCacheSubscribe>;
export declare const CMsgGCToGCSOCacheSubscribe_CMsgHaveVersions: MessageFns<CMsgGCToGCSOCacheSubscribe_CMsgHaveVersions>;
export declare const CMsgGCToGCSOCacheUnsubscribe: MessageFns<CMsgGCToGCSOCacheUnsubscribe>;
export declare const CMsgGCClientPing: MessageFns<CMsgGCClientPing>;
export declare const CMsgGCToGCForwardAccountDetails: MessageFns<CMsgGCToGCForwardAccountDetails>;
export declare const CMsgGCToGCLoadSessionSOCache: MessageFns<CMsgGCToGCLoadSessionSOCache>;
export declare const CMsgGCToGCLoadSessionSOCacheResponse: MessageFns<CMsgGCToGCLoadSessionSOCacheResponse>;
export declare const CMsgGCToGCUpdateSessionStats: MessageFns<CMsgGCToGCUpdateSessionStats>;
export declare const CMsgGCToClientRequestDropped: MessageFns<CMsgGCToClientRequestDropped>;
export declare const CWorkshopPopulateItemDescriptionsRequest: MessageFns<CWorkshopPopulateItemDescriptionsRequest>;
export declare const CWorkshopPopulateItemDescriptionsRequest_SingleItemDescription: MessageFns<CWorkshopPopulateItemDescriptionsRequest_SingleItemDescription>;
export declare const CWorkshopPopulateItemDescriptionsRequest_ItemDescriptionsLanguageBlock: MessageFns<CWorkshopPopulateItemDescriptionsRequest_ItemDescriptionsLanguageBlock>;
export declare const CWorkshopGetContributorsRequest: MessageFns<CWorkshopGetContributorsRequest>;
export declare const CWorkshopGetContributorsResponse: MessageFns<CWorkshopGetContributorsResponse>;
export declare const CWorkshopSetItemPaymentRulesRequest: MessageFns<CWorkshopSetItemPaymentRulesRequest>;
export declare const CWorkshopSetItemPaymentRulesRequest_WorkshopItemPaymentRule: MessageFns<CWorkshopSetItemPaymentRulesRequest_WorkshopItemPaymentRule>;
export declare const CWorkshopSetItemPaymentRulesRequest_WorkshopDirectPaymentRule: MessageFns<CWorkshopSetItemPaymentRulesRequest_WorkshopDirectPaymentRule>;
export declare const CWorkshopSetItemPaymentRulesRequest_PartnerItemPaymentRule: MessageFns<CWorkshopSetItemPaymentRulesRequest_PartnerItemPaymentRule>;
export declare const CWorkshopSetItemPaymentRulesResponse: MessageFns<CWorkshopSetItemPaymentRulesResponse>;
export declare const CCommunityClanAnnouncementInfo: MessageFns<CCommunityClanAnnouncementInfo>;
export declare const CCommunityGetClanAnnouncementsRequest: MessageFns<CCommunityGetClanAnnouncementsRequest>;
export declare const CCommunityGetClanAnnouncementsResponse: MessageFns<CCommunityGetClanAnnouncementsResponse>;
export declare const CBroadcastPostGameDataFrameRequest: MessageFns<CBroadcastPostGameDataFrameRequest>;
export declare const CMsgSerializedSOCache: MessageFns<CMsgSerializedSOCache>;
export declare const CMsgSerializedSOCache_TypeCache: MessageFns<CMsgSerializedSOCache_TypeCache>;
export declare const CMsgSerializedSOCache_Cache: MessageFns<CMsgSerializedSOCache_Cache>;
export declare const CMsgSerializedSOCache_Cache_Version: MessageFns<CMsgSerializedSOCache_Cache_Version>;
export declare const CMsgGCToClientPollConvarRequest: MessageFns<CMsgGCToClientPollConvarRequest>;
export declare const CMsgGCToClientPollConvarResponse: MessageFns<CMsgGCToClientPollConvarResponse>;
export declare const CGCMsgCompressedMsgToClient: MessageFns<CGCMsgCompressedMsgToClient>;
export declare const CMsgGCToGCMasterBroadcastMessage: MessageFns<CMsgGCToGCMasterBroadcastMessage>;
export declare const CMsgGCToGCMasterSubscribeToCache: MessageFns<CMsgGCToGCMasterSubscribeToCache>;
export declare const CMsgGCToGCMasterSubscribeToCacheResponse: MessageFns<CMsgGCToGCMasterSubscribeToCacheResponse>;
export declare const CMsgGCToGCMasterSubscribeToCacheAsync: MessageFns<CMsgGCToGCMasterSubscribeToCacheAsync>;
export declare const CMsgGCToGCMasterUnsubscribeFromCache: MessageFns<CMsgGCToGCMasterUnsubscribeFromCache>;
export declare const CMsgGCToGCMasterDestroyCache: MessageFns<CMsgGCToGCMasterDestroyCache>;
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
//# sourceMappingURL=gcsdk_gcmessages.d.ts.map