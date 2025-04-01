import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare enum EGCPlatform {
    k_eGCPlatform_None = 0,
    k_eGCPlatform_PC = 1,
    k_eGCPlatform_Mac = 2,
    k_eGCPlatform_Linux = 3,
    k_eGCPlatform_Android = 4,
    k_eGCPlatform_iOS = 5
}
export declare function eGCPlatformFromJSON(object: any): EGCPlatform;
export declare function eGCPlatformToJSON(object: EGCPlatform): string;
export declare enum GCProtoBufMsgSrc {
    GCProtoBufMsgSrc_Unspecified = 0,
    GCProtoBufMsgSrc_FromSystem = 1,
    GCProtoBufMsgSrc_FromSteamID = 2,
    GCProtoBufMsgSrc_FromGC = 3,
    GCProtoBufMsgSrc_ReplySystem = 4,
    GCProtoBufMsgSrc_SpoofedSteamID = 5
}
export declare function gCProtoBufMsgSrcFromJSON(object: any): GCProtoBufMsgSrc;
export declare function gCProtoBufMsgSrcToJSON(object: GCProtoBufMsgSrc): string;
export interface CMsgProtoBufHeader {
    clientSteamId: string;
    clientSessionId: number;
    sourceAppId: number;
    jobIdSource: string;
    jobIdTarget: string;
    targetJobName: string;
    eresult: number;
    errorMessage: string;
    gcMsgSrc: GCProtoBufMsgSrc;
    gcDirIndexSource: number;
}
export interface CGCSystemMsgGetAccountDetails {
    steamid: string;
    appid: number;
}
export interface CGCSystemMsgGetAccountDetailsResponse {
    eresultDeprecated: number;
    accountName: string;
    personaName: string;
    isProfileCreated: boolean;
    isProfilePublic: boolean;
    isInventoryPublic: boolean;
    isVacBanned: boolean;
    isCyberCafe: boolean;
    isSchoolAccount: boolean;
    isLimited: boolean;
    isSubscribed: boolean;
    package: number;
    isFreeTrialAccount: boolean;
    freeTrialExpiration: number;
    isLowViolence: boolean;
    isAccountLockedDown: boolean;
    isCommunityBanned: boolean;
    isTradeBanned: boolean;
    tradeBanExpiration: number;
    accountid: number;
    suspensionEndTime: number;
    currency: string;
    steamLevel: number;
    friendCount: number;
    accountCreationTime: number;
    isSteamguardEnabled: boolean;
    isPhoneVerified: boolean;
    isTwoFactorAuthEnabled: boolean;
    twoFactorEnabledTime: number;
    phoneVerificationTime: number;
    phoneId: string;
    isPhoneIdentifying: boolean;
    rtIdentityLinked: number;
    rtBirthDate: number;
    txnCountryCode: string;
    hasAcceptedChinaSsa: boolean;
    isBannedSteamChina: boolean;
}
export interface CIPLocationInfo {
    ip: number;
    latitude: number;
    longitude: number;
    country: string;
    state: string;
    city: string;
}
export interface CGCMsgGetIPLocationResponse {
    infos: CIPLocationInfo[];
}
export declare const CMsgProtoBufHeader: MessageFns<CMsgProtoBufHeader>;
export declare const CGCSystemMsgGetAccountDetails: MessageFns<CGCSystemMsgGetAccountDetails>;
export declare const CGCSystemMsgGetAccountDetailsResponse: MessageFns<CGCSystemMsgGetAccountDetailsResponse>;
export declare const CIPLocationInfo: MessageFns<CIPLocationInfo>;
export declare const CGCMsgGetIPLocationResponse: MessageFns<CGCMsgGetIPLocationResponse>;
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
//# sourceMappingURL=steammessages.d.ts.map