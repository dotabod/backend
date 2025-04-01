import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
import { EGCPlatform } from "./steammessages";
import { CMsgSteamLearnAccessTokens } from "./steammessages_steamlearn.steamworkssdk";
export declare enum EGCBaseMsg {
    k_EMsgGCInviteToParty = 4501,
    k_EMsgGCInvitationCreated = 4502,
    k_EMsgGCPartyInviteResponse = 4503,
    k_EMsgGCKickFromParty = 4504,
    k_EMsgGCLeaveParty = 4505,
    k_EMsgGCServerAvailable = 4506,
    k_EMsgGCClientConnectToServer = 4507,
    k_EMsgGCGameServerInfo = 4508,
    k_EMsgGCLANServerAvailable = 4511,
    k_EMsgGCInviteToLobby = 4512,
    k_EMsgGCLobbyInviteResponse = 4513,
    k_EMsgGCToClientPollFileRequest = 4514,
    k_EMsgGCToClientPollFileResponse = 4515,
    k_EMsgGCToGCPerformManualOp = 4516,
    k_EMsgGCToGCPerformManualOpCompleted = 4517,
    k_EMsgGCToGCReloadServerRegionSettings = 4518,
    k_EMsgGCAdditionalWelcomeMsgList = 4519,
    k_EMsgGCToClientApplyRemoteConVars = 4520,
    k_EMsgGCToServerApplyRemoteConVars = 4521,
    k_EMsgClientToGCIntegrityStatus = 4522,
    k_EMsgClientToGCAggregateMetrics = 4523,
    k_EMsgGCToClientAggregateMetricsBackoff = 4524,
    k_EMsgGCToServerSteamLearnAccessTokensChanged = 4525,
    k_EMsgGCToServerSteamLearnUseHTTP = 4526
}
export declare function eGCBaseMsgFromJSON(object: any): EGCBaseMsg;
export declare function eGCBaseMsgToJSON(object: EGCBaseMsg): string;
export declare enum ECustomGameInstallStatus {
    k_ECustomGameInstallStatus_Unknown = 0,
    k_ECustomGameInstallStatus_Ready = 1,
    k_ECustomGameInstallStatus_Busy = 2,
    k_ECustomGameInstallStatus_FailedGeneric = 101,
    k_ECustomGameInstallStatus_FailedInternalError = 102,
    k_ECustomGameInstallStatus_RequestedTimestampTooOld = 103,
    k_ECustomGameInstallStatus_RequestedTimestampTooNew = 104,
    k_ECustomGameInstallStatus_CRCMismatch = 105,
    k_ECustomGameInstallStatus_FailedSteam = 106,
    k_ECustomGameInstallStatus_FailedCanceled = 107
}
export declare function eCustomGameInstallStatusFromJSON(object: any): ECustomGameInstallStatus;
export declare function eCustomGameInstallStatusToJSON(object: ECustomGameInstallStatus): string;
export interface CGCStorePurchaseInitLineItem {
    itemDefId: number;
    quantity: number;
    costInLocalCurrency: number;
    purchaseType: number;
    sourceReferenceId: string;
    priceIndex: number;
}
export interface CMsgGCStorePurchaseInit {
    country: string;
    language: number;
    currency: number;
    lineItems: CGCStorePurchaseInitLineItem[];
}
export interface CMsgGCStorePurchaseInitResponse {
    result: number;
    txnId: string;
}
export interface CMsgClientPingData {
    relayCodes: number[];
    relayPings: number[];
    regionCodes: number[];
    regionPings: number[];
    regionPingFailedBitmask: number;
}
export interface CMsgInviteToParty {
    steamId: string;
    clientVersion: number;
    teamId: number;
    asCoach: boolean;
    pingData: CMsgClientPingData | undefined;
}
export interface CMsgInviteToLobby {
    steamId: string;
    clientVersion: number;
}
export interface CMsgInvitationCreated {
    groupId: string;
    steamId: string;
    userOffline: boolean;
}
export interface CMsgPartyInviteResponse {
    partyId: string;
    accept: boolean;
    clientVersion: number;
    pingData: CMsgClientPingData | undefined;
}
export interface CMsgLobbyInviteResponse {
    lobbyId: string;
    accept: boolean;
    clientVersion: number;
    customGameCrc: string;
    customGameTimestamp: number;
}
export interface CMsgKickFromParty {
    steamId: string;
}
export interface CMsgLeaveParty {
}
export interface CMsgCustomGameInstallStatus {
    status: ECustomGameInstallStatus;
    message: string;
    latestTimestampFromSteam: number;
}
export interface CMsgServerAvailable {
    customGameInstallStatus: CMsgCustomGameInstallStatus | undefined;
}
export interface CMsgLANServerAvailable {
    lobbyId: string;
}
export interface CSOEconGameAccountClient {
    additionalBackpackSlots: number;
    trialAccount: boolean;
    eligibleForOnlinePlay: boolean;
    needToChooseMostHelpfulFriend: boolean;
    inCoachesList: boolean;
    tradeBanExpiration: number;
    duelBanExpiration: number;
    madeFirstPurchase: boolean;
}
export interface CMsgApplyStrangePart {
    strangePartItemId: string;
    itemItemId: string;
}
export interface CMsgApplyPennantUpgrade {
    upgradeItemId: string;
    pennantItemId: string;
}
export interface CMsgApplyEggEssence {
    essenceItemId: string;
    eggItemId: string;
}
export interface CSOEconItemAttribute {
    defIndex: number;
    value: number;
    valueBytes: Buffer;
}
export interface CSOEconItemEquipped {
    newClass: number;
    newSlot: number;
}
export interface CSOEconItem {
    id: string;
    accountId: number;
    inventory: number;
    defIndex: number;
    quantity: number;
    level: number;
    quality: number;
    flags: number;
    origin: number;
    attribute: CSOEconItemAttribute[];
    interiorItem: CSOEconItem | undefined;
    style: number;
    originalId: string;
    equippedState: CSOEconItemEquipped[];
}
export interface CMsgSortItems {
    sortType: number;
}
export interface CMsgItemAcknowledged {
    accountId: number;
    inventory: number;
    defIndex: number;
    quality: number;
    rarity: number;
    origin: number;
}
export interface CMsgSetItemPositions {
    itemPositions: CMsgSetItemPositions_ItemPosition[];
}
export interface CMsgSetItemPositions_ItemPosition {
    itemId: string;
    position: number;
}
export interface CMsgGCStorePurchaseCancel {
    txnId: string;
}
export interface CMsgGCStorePurchaseCancelResponse {
    result: number;
}
export interface CMsgGCStorePurchaseFinalize {
    txnId: string;
}
export interface CMsgGCStorePurchaseFinalizeResponse {
    result: number;
    itemIds: string[];
}
export interface CMsgGCToGCBannedWordListUpdated {
    groupId: number;
}
export interface CMsgGCToGCDirtySDOCache {
    sdoType: number;
    keyUint64: string;
}
export interface CMsgSDONoMemcached {
}
export interface CMsgGCToGCUpdateSQLKeyValue {
    keyName: string;
}
export interface CMsgGCServerVersionUpdated {
    serverVersion: number;
}
export interface CMsgGCClientVersionUpdated {
    clientVersion: number;
}
export interface CMsgGCToGCWebAPIAccountChanged {
}
export interface CMsgExtractGems {
    toolItemId: string;
    itemItemId: string;
    itemSocketId: number;
}
export interface CMsgExtractGemsResponse {
    itemId: string;
    response: CMsgExtractGemsResponse_EExtractGems;
}
export declare enum CMsgExtractGemsResponse_EExtractGems {
    k_ExtractGems_Succeeded = 0,
    k_ExtractGems_Failed_ToolIsInvalid = 1,
    k_ExtractGems_Failed_ItemIsInvalid = 2,
    k_ExtractGems_Failed_ToolCannotRemoveGem = 3,
    k_ExtractGems_Failed_FailedToRemoveGem = 4
}
export declare function cMsgExtractGemsResponse_EExtractGemsFromJSON(object: any): CMsgExtractGemsResponse_EExtractGems;
export declare function cMsgExtractGemsResponse_EExtractGemsToJSON(object: CMsgExtractGemsResponse_EExtractGems): string;
export interface CMsgAddSocket {
    toolItemId: string;
    itemItemId: string;
    unusual: boolean;
}
export interface CMsgAddSocketResponse {
    itemId: string;
    updatedSocketIndex: number[];
    response: CMsgAddSocketResponse_EAddSocket;
}
export declare enum CMsgAddSocketResponse_EAddSocket {
    k_AddSocket_Succeeded = 0,
    k_AddSocket_Failed_ToolIsInvalid = 1,
    k_AddSocket_Failed_ItemCannotBeSocketed = 2,
    k_AddSocket_Failed_FailedToAddSocket = 3
}
export declare function cMsgAddSocketResponse_EAddSocketFromJSON(object: any): CMsgAddSocketResponse_EAddSocket;
export declare function cMsgAddSocketResponse_EAddSocketToJSON(object: CMsgAddSocketResponse_EAddSocket): string;
export interface CMsgAddItemToSocketData {
    gemItemId: string;
    socketIndex: number;
}
export interface CMsgAddItemToSocket {
    itemItemId: string;
    gemsToSocket: CMsgAddItemToSocketData[];
}
export interface CMsgAddItemToSocketResponse {
    itemItemId: string;
    updatedSocketIndex: number[];
    response: CMsgAddItemToSocketResponse_EAddGem;
}
export declare enum CMsgAddItemToSocketResponse_EAddGem {
    k_AddGem_Succeeded = 0,
    k_AddGem_Failed_GemIsInvalid = 1,
    k_AddGem_Failed_ItemIsInvalid = 2,
    k_AddGem_Failed_FailedToAddGem = 3,
    k_AddGem_Failed_InvalidGemTypeForSocket = 4,
    k_AddGem_Failed_InvalidGemTypeForHero = 5,
    k_AddGem_Failed_InvalidGemTypeForSlot = 6,
    k_AddGem_Failed_SocketContainsUnremovableGem = 7
}
export declare function cMsgAddItemToSocketResponse_EAddGemFromJSON(object: any): CMsgAddItemToSocketResponse_EAddGem;
export declare function cMsgAddItemToSocketResponse_EAddGemToJSON(object: CMsgAddItemToSocketResponse_EAddGem): string;
export interface CMsgResetStrangeGemCount {
    itemItemId: string;
    socketIndex: number;
}
export interface CMsgResetStrangeGemCountResponse {
    response: CMsgResetStrangeGemCountResponse_EResetGem;
}
export declare enum CMsgResetStrangeGemCountResponse_EResetGem {
    k_ResetGem_Succeeded = 0,
    k_ResetGem_Failed_FailedToResetGem = 1,
    k_ResetGem_Failed_ItemIsInvalid = 2,
    k_ResetGem_Failed_InvalidSocketId = 3,
    k_ResetGem_Failed_SocketCannotBeReset = 4
}
export declare function cMsgResetStrangeGemCountResponse_EResetGemFromJSON(object: any): CMsgResetStrangeGemCountResponse_EResetGem;
export declare function cMsgResetStrangeGemCountResponse_EResetGemToJSON(object: CMsgResetStrangeGemCountResponse_EResetGem): string;
export interface CMsgGCToClientPollFileRequest {
    fileName: string;
    clientVersion: number;
    pollId: number;
}
export interface CMsgGCToClientPollFileResponse {
    pollId: number;
    fileSize: number;
    fileCrc: number;
}
export interface CMsgGCToGCPerformManualOp {
    opId: string;
    groupCode: number;
}
export interface CMsgGCToGCPerformManualOpCompleted {
    success: boolean;
    sourceGc: number;
}
export interface CMsgGCToGCReloadServerRegionSettings {
}
export interface CMsgGCAdditionalWelcomeMsgList {
    welcomeMessages: CExtraMsgBlock[];
}
export interface CMsgApplyRemoteConVars {
    conVars: CMsgApplyRemoteConVars_ConVar[];
}
export interface CMsgApplyRemoteConVars_ConVar {
    name: string;
    value: string;
    versionMin: number;
    versionMax: number;
    platform: EGCPlatform;
}
export interface CMsgGCToClientApplyRemoteConVars {
    msg: CMsgApplyRemoteConVars | undefined;
}
export interface CMsgGCToServerApplyRemoteConVars {
    msg: CMsgApplyRemoteConVars | undefined;
}
export interface CMsgClientToGCIntegrityStatus {
    report: string;
    secureAllowed: boolean;
    diagnostics: CMsgClientToGCIntegrityStatus_keyvalue[];
}
export interface CMsgClientToGCIntegrityStatus_keyvalue {
    id: number;
    extended: number;
    value: string;
    stringValue: string;
}
export interface CMsgClientToGCAggregateMetrics {
    metrics: CMsgClientToGCAggregateMetrics_SingleMetric[];
}
export interface CMsgClientToGCAggregateMetrics_SingleMetric {
    metricName: string;
    metricCount: number;
}
export interface CMsgGCToClientAggregateMetricsBackoff {
    uploadRateModifier: number;
}
export interface CMsgGCToServerSteamLearnAccessTokensChanged {
    accessTokens: CMsgSteamLearnAccessTokens | undefined;
}
export interface CMsgGCToServerSteamLearnUseHTTP {
    useHttp: boolean;
}
export declare const CGCStorePurchaseInitLineItem: MessageFns<CGCStorePurchaseInitLineItem>;
export declare const CMsgGCStorePurchaseInit: MessageFns<CMsgGCStorePurchaseInit>;
export declare const CMsgGCStorePurchaseInitResponse: MessageFns<CMsgGCStorePurchaseInitResponse>;
export declare const CMsgClientPingData: MessageFns<CMsgClientPingData>;
export declare const CMsgInviteToParty: MessageFns<CMsgInviteToParty>;
export declare const CMsgInviteToLobby: MessageFns<CMsgInviteToLobby>;
export declare const CMsgInvitationCreated: MessageFns<CMsgInvitationCreated>;
export declare const CMsgPartyInviteResponse: MessageFns<CMsgPartyInviteResponse>;
export declare const CMsgLobbyInviteResponse: MessageFns<CMsgLobbyInviteResponse>;
export declare const CMsgKickFromParty: MessageFns<CMsgKickFromParty>;
export declare const CMsgLeaveParty: MessageFns<CMsgLeaveParty>;
export declare const CMsgCustomGameInstallStatus: MessageFns<CMsgCustomGameInstallStatus>;
export declare const CMsgServerAvailable: MessageFns<CMsgServerAvailable>;
export declare const CMsgLANServerAvailable: MessageFns<CMsgLANServerAvailable>;
export declare const CSOEconGameAccountClient: MessageFns<CSOEconGameAccountClient>;
export declare const CMsgApplyStrangePart: MessageFns<CMsgApplyStrangePart>;
export declare const CMsgApplyPennantUpgrade: MessageFns<CMsgApplyPennantUpgrade>;
export declare const CMsgApplyEggEssence: MessageFns<CMsgApplyEggEssence>;
export declare const CSOEconItemAttribute: MessageFns<CSOEconItemAttribute>;
export declare const CSOEconItemEquipped: MessageFns<CSOEconItemEquipped>;
export declare const CSOEconItem: MessageFns<CSOEconItem>;
export declare const CMsgSortItems: MessageFns<CMsgSortItems>;
export declare const CMsgItemAcknowledged: MessageFns<CMsgItemAcknowledged>;
export declare const CMsgSetItemPositions: MessageFns<CMsgSetItemPositions>;
export declare const CMsgSetItemPositions_ItemPosition: MessageFns<CMsgSetItemPositions_ItemPosition>;
export declare const CMsgGCStorePurchaseCancel: MessageFns<CMsgGCStorePurchaseCancel>;
export declare const CMsgGCStorePurchaseCancelResponse: MessageFns<CMsgGCStorePurchaseCancelResponse>;
export declare const CMsgGCStorePurchaseFinalize: MessageFns<CMsgGCStorePurchaseFinalize>;
export declare const CMsgGCStorePurchaseFinalizeResponse: MessageFns<CMsgGCStorePurchaseFinalizeResponse>;
export declare const CMsgGCToGCBannedWordListUpdated: MessageFns<CMsgGCToGCBannedWordListUpdated>;
export declare const CMsgGCToGCDirtySDOCache: MessageFns<CMsgGCToGCDirtySDOCache>;
export declare const CMsgSDONoMemcached: MessageFns<CMsgSDONoMemcached>;
export declare const CMsgGCToGCUpdateSQLKeyValue: MessageFns<CMsgGCToGCUpdateSQLKeyValue>;
export declare const CMsgGCServerVersionUpdated: MessageFns<CMsgGCServerVersionUpdated>;
export declare const CMsgGCClientVersionUpdated: MessageFns<CMsgGCClientVersionUpdated>;
export declare const CMsgGCToGCWebAPIAccountChanged: MessageFns<CMsgGCToGCWebAPIAccountChanged>;
export declare const CMsgExtractGems: MessageFns<CMsgExtractGems>;
export declare const CMsgExtractGemsResponse: MessageFns<CMsgExtractGemsResponse>;
export declare const CMsgAddSocket: MessageFns<CMsgAddSocket>;
export declare const CMsgAddSocketResponse: MessageFns<CMsgAddSocketResponse>;
export declare const CMsgAddItemToSocketData: MessageFns<CMsgAddItemToSocketData>;
export declare const CMsgAddItemToSocket: MessageFns<CMsgAddItemToSocket>;
export declare const CMsgAddItemToSocketResponse: MessageFns<CMsgAddItemToSocketResponse>;
export declare const CMsgResetStrangeGemCount: MessageFns<CMsgResetStrangeGemCount>;
export declare const CMsgResetStrangeGemCountResponse: MessageFns<CMsgResetStrangeGemCountResponse>;
export declare const CMsgGCToClientPollFileRequest: MessageFns<CMsgGCToClientPollFileRequest>;
export declare const CMsgGCToClientPollFileResponse: MessageFns<CMsgGCToClientPollFileResponse>;
export declare const CMsgGCToGCPerformManualOp: MessageFns<CMsgGCToGCPerformManualOp>;
export declare const CMsgGCToGCPerformManualOpCompleted: MessageFns<CMsgGCToGCPerformManualOpCompleted>;
export declare const CMsgGCToGCReloadServerRegionSettings: MessageFns<CMsgGCToGCReloadServerRegionSettings>;
export declare const CMsgGCAdditionalWelcomeMsgList: MessageFns<CMsgGCAdditionalWelcomeMsgList>;
export declare const CMsgApplyRemoteConVars: MessageFns<CMsgApplyRemoteConVars>;
export declare const CMsgApplyRemoteConVars_ConVar: MessageFns<CMsgApplyRemoteConVars_ConVar>;
export declare const CMsgGCToClientApplyRemoteConVars: MessageFns<CMsgGCToClientApplyRemoteConVars>;
export declare const CMsgGCToServerApplyRemoteConVars: MessageFns<CMsgGCToServerApplyRemoteConVars>;
export declare const CMsgClientToGCIntegrityStatus: MessageFns<CMsgClientToGCIntegrityStatus>;
export declare const CMsgClientToGCIntegrityStatus_keyvalue: MessageFns<CMsgClientToGCIntegrityStatus_keyvalue>;
export declare const CMsgClientToGCAggregateMetrics: MessageFns<CMsgClientToGCAggregateMetrics>;
export declare const CMsgClientToGCAggregateMetrics_SingleMetric: MessageFns<CMsgClientToGCAggregateMetrics_SingleMetric>;
export declare const CMsgGCToClientAggregateMetricsBackoff: MessageFns<CMsgGCToClientAggregateMetricsBackoff>;
export declare const CMsgGCToServerSteamLearnAccessTokensChanged: MessageFns<CMsgGCToServerSteamLearnAccessTokensChanged>;
export declare const CMsgGCToServerSteamLearnUseHTTP: MessageFns<CMsgGCToServerSteamLearnUseHTTP>;
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
//# sourceMappingURL=base_gcmessages.d.ts.map