import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare enum EGCEconBaseMsg {
    k_EMsgGCGenericResult = 2579
}
export declare function eGCEconBaseMsgFromJSON(object: any): EGCEconBaseMsg;
export declare function eGCEconBaseMsgToJSON(object: EGCEconBaseMsg): string;
export declare enum EGCMsgResponse {
    k_EGCMsgResponseOK = 0,
    k_EGCMsgResponseDenied = 1,
    k_EGCMsgResponseServerError = 2,
    k_EGCMsgResponseTimeout = 3,
    k_EGCMsgResponseInvalid = 4,
    k_EGCMsgResponseNoMatch = 5,
    k_EGCMsgResponseUnknownError = 6,
    k_EGCMsgResponseNotLoggedOn = 7,
    k_EGCMsgFailedToCreate = 8
}
export declare function eGCMsgResponseFromJSON(object: any): EGCMsgResponse;
export declare function eGCMsgResponseToJSON(object: EGCMsgResponse): string;
export declare enum EGCMsgUseItemResponse {
    k_EGCMsgUseItemResponse_ItemUsed = 0,
    k_EGCMsgUseItemResponse_GiftNoOtherPlayers = 1,
    k_EGCMsgUseItemResponse_ServerError = 2,
    k_EGCMsgUseItemResponse_MiniGameAlreadyStarted = 3,
    k_EGCMsgUseItemResponse_ItemUsed_ItemsGranted = 4,
    k_EGCMsgUseItemResponse_DropRateBonusAlreadyGranted = 5,
    k_EGCMsgUseItemResponse_NotInLowPriorityPool = 6,
    k_EGCMsgUseItemResponse_NotHighEnoughLevel = 7,
    k_EGCMsgUseItemResponse_EventNotActive = 8,
    k_EGCMsgUseItemResponse_ItemUsed_EventPointsGranted = 9,
    k_EGCMsgUseItemResponse_MissingRequirement = 10,
    k_EGCMsgUseItemResponse_EmoticonUnlock_NoNew = 11,
    k_EGCMsgUseItemResponse_EmoticonUnlock_Complete = 12,
    k_EGCMsgUseItemResponse_ItemUsed_Compendium = 13
}
export declare function eGCMsgUseItemResponseFromJSON(object: any): EGCMsgUseItemResponse;
export declare function eGCMsgUseItemResponseToJSON(object: EGCMsgUseItemResponse): string;
export interface CMsgGenericResult {
    eresult: number;
    debugMessage: string;
}
export declare const CMsgGenericResult: MessageFns<CMsgGenericResult>;
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
//# sourceMappingURL=econ_shared_enums.d.ts.map