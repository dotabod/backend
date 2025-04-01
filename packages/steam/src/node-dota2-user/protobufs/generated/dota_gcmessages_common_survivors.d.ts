import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export interface CMsgSurvivorsUserData {
    attributeLevels: CMsgSurvivorsUserData_AttributeLevelsEntry[];
    unlockedDifficulty: number;
}
export interface CMsgSurvivorsUserData_AttributeLevelsEntry {
    key: number;
    value: number;
}
export interface CMsgClientToGCSurvivorsPowerUpTelemetryData {
    powerupId: number;
    level: number;
    timeReceived: number;
    timeHeld: number;
    totalDamage: string;
    dps: number;
    hasScepter: number;
}
export interface CMsgClientToGCSurvivorsGameTelemetryData {
    timeSurvived: number;
    playerLevel: number;
    gameResult: number;
    goldEarned: number;
    powerups: CMsgClientToGCSurvivorsPowerUpTelemetryData[];
    difficulty: number;
    metaprogressionLevel: number;
}
export interface CMsgClientToGCSurvivorsGameTelemetryDataResponse {
    response: CMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponse;
}
export declare enum CMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidItem = 6
}
export declare function cMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponseFromJSON(object: any): CMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponse;
export declare function cMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponseToJSON(object: CMsgClientToGCSurvivorsGameTelemetryDataResponse_EResponse): string;
export declare const CMsgSurvivorsUserData: MessageFns<CMsgSurvivorsUserData>;
export declare const CMsgSurvivorsUserData_AttributeLevelsEntry: MessageFns<CMsgSurvivorsUserData_AttributeLevelsEntry>;
export declare const CMsgClientToGCSurvivorsPowerUpTelemetryData: MessageFns<CMsgClientToGCSurvivorsPowerUpTelemetryData>;
export declare const CMsgClientToGCSurvivorsGameTelemetryData: MessageFns<CMsgClientToGCSurvivorsGameTelemetryData>;
export declare const CMsgClientToGCSurvivorsGameTelemetryDataResponse: MessageFns<CMsgClientToGCSurvivorsGameTelemetryDataResponse>;
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
//# sourceMappingURL=dota_gcmessages_common_survivors.d.ts.map