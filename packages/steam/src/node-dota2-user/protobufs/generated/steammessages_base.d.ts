import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare enum EBanContentCheckResult {
    k_EBanContentCheckResult_NotScanned = 0,
    k_EBanContentCheckResult_Reset = 1,
    k_EBanContentCheckResult_NeedsChecking = 2,
    k_EBanContentCheckResult_VeryUnlikely = 5,
    k_EBanContentCheckResult_Unlikely = 30,
    k_EBanContentCheckResult_Possible = 50,
    k_EBanContentCheckResult_Likely = 75,
    k_EBanContentCheckResult_VeryLikely = 100
}
export declare function eBanContentCheckResultFromJSON(object: any): EBanContentCheckResult;
export declare function eBanContentCheckResultToJSON(object: EBanContentCheckResult): string;
export declare enum EProtoClanEventType {
    k_EClanOtherEvent = 1,
    k_EClanGameEvent = 2,
    k_EClanPartyEvent = 3,
    k_EClanMeetingEvent = 4,
    k_EClanSpecialCauseEvent = 5,
    k_EClanMusicAndArtsEvent = 6,
    k_EClanSportsEvent = 7,
    k_EClanTripEvent = 8,
    k_EClanChatEvent = 9,
    k_EClanGameReleaseEvent = 10,
    k_EClanBroadcastEvent = 11,
    k_EClanSmallUpdateEvent = 12,
    k_EClanPreAnnounceMajorUpdateEvent = 13,
    k_EClanMajorUpdateEvent = 14,
    k_EClanDLCReleaseEvent = 15,
    k_EClanFutureReleaseEvent = 16,
    k_EClanESportTournamentStreamEvent = 17,
    k_EClanDevStreamEvent = 18,
    k_EClanFamousStreamEvent = 19,
    k_EClanGameSalesEvent = 20,
    k_EClanGameItemSalesEvent = 21,
    k_EClanInGameBonusXPEvent = 22,
    k_EClanInGameLootEvent = 23,
    k_EClanInGamePerksEvent = 24,
    k_EClanInGameChallengeEvent = 25,
    k_EClanInGameContestEvent = 26,
    k_EClanIRLEvent = 27,
    k_EClanNewsEvent = 28,
    k_EClanBetaReleaseEvent = 29,
    k_EClanInGameContentReleaseEvent = 30,
    k_EClanFreeTrial = 31,
    k_EClanSeasonRelease = 32,
    k_EClanSeasonUpdate = 33,
    k_EClanCrosspostEvent = 34,
    k_EClanInGameEventGeneral = 35
}
export declare function eProtoClanEventTypeFromJSON(object: any): EProtoClanEventType;
export declare function eProtoClanEventTypeToJSON(object: EProtoClanEventType): string;
export declare enum PartnerEventNotificationType {
    k_EEventStart = 0,
    k_EEventBroadcastStart = 1,
    k_EEventMatchStart = 2,
    k_EEventPartnerMaxType = 3
}
export declare function partnerEventNotificationTypeFromJSON(object: any): PartnerEventNotificationType;
export declare function partnerEventNotificationTypeToJSON(object: PartnerEventNotificationType): string;
export interface CMsgIPAddress {
    v4?: number | undefined;
    v6?: Buffer | undefined;
}
export interface CMsgIPAddressBucket {
    originalIpAddress: CMsgIPAddress | undefined;
    bucket: string;
}
export interface CMsgGCRoutingProtoBufHeader {
    dstGcidQueue: string;
    dstGcDirIndex: number;
}
export interface CMsgProtoBufHeader {
    steamid: string;
    clientSessionid: number;
    routingAppid: number;
    jobidSource: string;
    jobidTarget: string;
    targetJobName: string;
    seqNum: number;
    eresult: number;
    errorMessage: string;
    authAccountFlags: number;
    tokenSource: number;
    adminSpoofingUser: boolean;
    transportError: number;
    messageid: string;
    publisherGroupId: number;
    sysid: number;
    traceTag: string;
    webapiKeyId: number;
    isFromExternalSource: boolean;
    forwardToSysid: number[];
    cmSysid: number;
    launcherType: number;
    realm: number;
    timeoutMs: number;
    debugSource: string;
    debugSourceStringIndex: number;
    tokenId: string;
    routingGc: CMsgGCRoutingProtoBufHeader | undefined;
    sessionDisposition: CMsgProtoBufHeader_ESessionDisposition;
    wgToken: string;
    webuiAuthKey: string;
    ip?: number | undefined;
    ipV6?: Buffer | undefined;
}
export declare enum CMsgProtoBufHeader_ESessionDisposition {
    k_ESessionDispositionNormal = 0,
    k_ESessionDispositionDisconnect = 1
}
export declare function cMsgProtoBufHeader_ESessionDispositionFromJSON(object: any): CMsgProtoBufHeader_ESessionDisposition;
export declare function cMsgProtoBufHeader_ESessionDispositionToJSON(object: CMsgProtoBufHeader_ESessionDisposition): string;
export interface CMsgMulti {
    sizeUnzipped: number;
    messageBody: Buffer;
}
export interface CMsgProtobufWrapped {
    messageBody: Buffer;
}
export interface CMsgAuthTicket {
    estate: number;
    eresult: number;
    steamid: string;
    gameid: string;
    hSteamPipe: number;
    ticketCrc: number;
    ticket: Buffer;
    serverSecret: Buffer;
    ticketType: number;
}
export interface CCDDBAppDetailCommon {
    appid: number;
    name: string;
    icon: string;
    tool: boolean;
    demo: boolean;
    media: boolean;
    communityVisibleStats: boolean;
    friendlyName: string;
    propagation: string;
    hasAdultContent: boolean;
    isVisibleInSteamChina: boolean;
    appType: number;
    hasAdultContentSex: boolean;
    hasAdultContentViolence: boolean;
    contentDescriptorids: number[];
}
export interface CMsgAppRights {
    editInfo: boolean;
    publish: boolean;
    viewErrorData: boolean;
    download: boolean;
    uploadCdkeys: boolean;
    generateCdkeys: boolean;
    viewFinancials: boolean;
    manageCeg: boolean;
    manageSigning: boolean;
    manageCdkeys: boolean;
    editMarketing: boolean;
    economySupport: boolean;
    economySupportSupervisor: boolean;
    managePricing: boolean;
    broadcastLive: boolean;
    viewMarketingTraffic: boolean;
    editStoreDisplayContent: boolean;
}
export interface CCuratorPreferences {
    supportedLanguages: number;
    platformWindows: boolean;
    platformMac: boolean;
    platformLinux: boolean;
    vrContent: boolean;
    adultContentViolence: boolean;
    adultContentSex: boolean;
    timestampUpdated: number;
    tagidsCurated: number[];
    tagidsFiltered: number[];
    websiteTitle: string;
    websiteUrl: string;
    discussionUrl: string;
    showBroadcast: boolean;
}
export interface CLocalizationToken {
    language: number;
    localizedString: string;
}
export interface CClanEventUserNewsTuple {
    clanid: number;
    eventGid: string;
    announcementGid: string;
    rtimeStart: number;
    rtimeEnd: number;
    priorityScore: number;
    type: number;
    clampRangeSlot: number;
    appid: number;
    rtime32LastModified: number;
}
export interface CClanMatchEventByRange {
    rtimeBefore: number;
    rtimeAfter: number;
    qualified: number;
    events: CClanEventUserNewsTuple[];
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
    eventGid: string;
    voteupcount: number;
    votedowncount: number;
    banCheckResult: EBanContentCheckResult;
    banned: boolean;
}
export interface CClanEventData {
    gid: string;
    clanSteamid: string;
    eventName: string;
    eventType: EProtoClanEventType;
    appid: number;
    serverAddress: string;
    serverPassword: string;
    rtime32StartTime: number;
    rtime32EndTime: number;
    commentCount: number;
    creatorSteamid: string;
    lastUpdateSteamid: string;
    eventNotes: string;
    jsondata: string;
    announcementBody: CCommunityClanAnnouncementInfo | undefined;
    published: boolean;
    hidden: boolean;
    rtime32VisibilityStart: number;
    rtime32VisibilityEnd: number;
    broadcasterAccountid: number;
    followerCount: number;
    ignoreCount: number;
    forumTopicId: string;
    rtime32LastModified: number;
    newsPostGid: string;
    rtimeModReviewed: number;
    featuredAppTagid: number;
    referencedAppids: number[];
    buildId: number;
    buildBranch: string;
}
export interface CBillingAddress {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    usState: string;
    countryCode: string;
    postcode: string;
    zipPlus4: number;
    phone: string;
}
export interface CPackageReservationStatus {
    packageid: number;
    reservationState: number;
    queuePosition: number;
    totalQueueSize: number;
    reservationCountryCode: string;
    expired: boolean;
    timeExpires: number;
    timeReserved: number;
}
export interface CMsgKeyValuePair {
    name: string;
    value: string;
}
export interface CMsgKeyValueSet {
    pairs: CMsgKeyValuePair[];
}
export interface UserContentDescriptorPreferences {
    contentDescriptorsToExclude: UserContentDescriptorPreferences_ContentDescriptor[];
}
export interface UserContentDescriptorPreferences_ContentDescriptor {
    contentDescriptorid: number;
    timestampAdded: number;
}
export declare const CMsgIPAddress: MessageFns<CMsgIPAddress>;
export declare const CMsgIPAddressBucket: MessageFns<CMsgIPAddressBucket>;
export declare const CMsgGCRoutingProtoBufHeader: MessageFns<CMsgGCRoutingProtoBufHeader>;
export declare const CMsgProtoBufHeader: MessageFns<CMsgProtoBufHeader>;
export declare const CMsgMulti: MessageFns<CMsgMulti>;
export declare const CMsgProtobufWrapped: MessageFns<CMsgProtobufWrapped>;
export declare const CMsgAuthTicket: MessageFns<CMsgAuthTicket>;
export declare const CCDDBAppDetailCommon: MessageFns<CCDDBAppDetailCommon>;
export declare const CMsgAppRights: MessageFns<CMsgAppRights>;
export declare const CCuratorPreferences: MessageFns<CCuratorPreferences>;
export declare const CLocalizationToken: MessageFns<CLocalizationToken>;
export declare const CClanEventUserNewsTuple: MessageFns<CClanEventUserNewsTuple>;
export declare const CClanMatchEventByRange: MessageFns<CClanMatchEventByRange>;
export declare const CCommunityClanAnnouncementInfo: MessageFns<CCommunityClanAnnouncementInfo>;
export declare const CClanEventData: MessageFns<CClanEventData>;
export declare const CBillingAddress: MessageFns<CBillingAddress>;
export declare const CPackageReservationStatus: MessageFns<CPackageReservationStatus>;
export declare const CMsgKeyValuePair: MessageFns<CMsgKeyValuePair>;
export declare const CMsgKeyValueSet: MessageFns<CMsgKeyValueSet>;
export declare const UserContentDescriptorPreferences: MessageFns<UserContentDescriptorPreferences>;
export declare const UserContentDescriptorPreferences_ContentDescriptor: MessageFns<UserContentDescriptorPreferences_ContentDescriptor>;
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
//# sourceMappingURL=steammessages_base.d.ts.map