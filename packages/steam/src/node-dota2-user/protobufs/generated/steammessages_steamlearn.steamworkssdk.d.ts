import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
export declare enum ESteamLearnDataType {
    STEAMLEARN_DATATYPE_INVALID = 0,
    STEAMLEARN_DATATYPE_INT32 = 1,
    STEAMLEARN_DATATYPE_FLOAT32 = 2,
    STEAMLEARN_DATATYPE_BOOL = 3,
    STEAMLEARN_DATATYPE_STRING = 4,
    STEAMLEARN_DATATYPE_OBJECT = 5
}
export declare function eSteamLearnDataTypeFromJSON(object: any): ESteamLearnDataType;
export declare function eSteamLearnDataTypeToJSON(object: ESteamLearnDataType): string;
export declare enum ESteammLearnRegisterDataSourceResult {
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR = 0,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_SUCCESS_CREATED = 1,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_SUCCESS_FOUND = 2,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_GENERIC = 3,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_INVALID_NAME = 4,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_INVALID_VERSION = 5,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_DATA_CHANGED = 6,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_DATA_INVALID = 7,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_FORBIDDEN = 8,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_ERROR_INVALID_TIMESTAMP = 9,
    STEAMLEARN_REGISTER_DATA_SOURCE_RESULT_DISABLED = 10
}
export declare function eSteammLearnRegisterDataSourceResultFromJSON(object: any): ESteammLearnRegisterDataSourceResult;
export declare function eSteammLearnRegisterDataSourceResultToJSON(object: ESteammLearnRegisterDataSourceResult): string;
export declare enum ESteamLearnCacheDataResult {
    STEAMLEARN_CACHE_DATA_ERROR = 0,
    STEAMLEARN_CACHE_DATA_SUCCESS = 1,
    STEAMLEARN_CACHE_DATA_ERROR_UNKNOWN_DATA_SOURCE = 2,
    STEAMLEARN_CACHE_DATA_ERROR_UNCACHED_DATA_SOURCE = 3,
    STEAMLEARN_CACHE_DATA_ERROR_INVALID_KEYS = 4,
    STEAMLEARN_CACHE_DATA_ERROR_FORBIDDEN = 5,
    STEAMLEARN_CACHE_DATA_ERROR_INVALID_TIMESTAMP = 6,
    STEAMLEARN_CACHE_DATA_DISABLED = 7
}
export declare function eSteamLearnCacheDataResultFromJSON(object: any): ESteamLearnCacheDataResult;
export declare function eSteamLearnCacheDataResultToJSON(object: ESteamLearnCacheDataResult): string;
export declare enum ESteamLearnSnapshotProjectResult {
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR = 0,
    STEAMLEARN_SNAPSHOT_PROJECT_SUCCESS_STORED = 1,
    STEAMLEARN_SNAPSHOT_PROJECT_SUCCESS_QUEUED = 2,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_INVALID_PROJECT_ID = 3,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_UNKNOWN_DATA_SOURCE = 4,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_INVALID_DATA_SOURCE_KEY = 5,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_MISSING_CACHE_DURATION = 6,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_NO_PUBLISHED_CONFIG = 7,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_FORBIDDEN = 8,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_INVALID_TIMESTAMP = 9,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_INTERNAL_DATA_SOURCE_ERROR = 10,
    STEAMLEARN_SNAPSHOT_PROJECT_DISABLED = 11,
    STEAMLEARN_SNAPSHOT_PROJECT_ERROR_INVALID_PUBLISHED_VERSION = 12
}
export declare function eSteamLearnSnapshotProjectResultFromJSON(object: any): ESteamLearnSnapshotProjectResult;
export declare function eSteamLearnSnapshotProjectResultToJSON(object: ESteamLearnSnapshotProjectResult): string;
export declare enum ESteamLearnGetAccessTokensResult {
    STEAMLEARN_GET_ACCESS_TOKENS_ERROR = 0,
    STEAMLEARN_GET_ACCESS_TOKENS_SUCCESS = 1
}
export declare function eSteamLearnGetAccessTokensResultFromJSON(object: any): ESteamLearnGetAccessTokensResult;
export declare function eSteamLearnGetAccessTokensResultToJSON(object: ESteamLearnGetAccessTokensResult): string;
export declare enum ESteamLearnInferenceResult {
    STEAMLEARN_INFERENCE_ERROR = 0,
    STEAMLEARN_INFERENCE_SUCCESS = 1,
    STEAMLEARN_INFERENCE_ERROR_INVALID_PROJECT_ID = 2,
    STEAMLEARN_INFERENCE_ERROR_MISSING_CACHED_SCHEMA_DATA = 3,
    STEAMLEARN_INFERENCE_ERROR_NO_PUBLISHED_CONFIG = 4,
    STEAMLEARN_INFERENCE_ERROR_FORBIDDEN = 5,
    STEAMLEARN_INFERENCE_ERROR_INVALID_TIMESTAMP = 6,
    STEAMLEARN_INFERENCE_ERROR_INVALID_PUBLISHED_VERSION = 7,
    STEAMLEARN_INFERENCE_ERROR_NO_FETCH_ID_FOUND = 8,
    STEAMLEARN_INFERENCE_ERROR_TOO_BUSY = 9
}
export declare function eSteamLearnInferenceResultFromJSON(object: any): ESteamLearnInferenceResult;
export declare function eSteamLearnInferenceResultToJSON(object: ESteamLearnInferenceResult): string;
export declare enum ESteamLearnInferenceMetadataResult {
    STEAMLEARN_INFERENCE_METADATA_ERROR = 0,
    STEAMLEARN_INFERENCE_METADATA_SUCCESS = 1,
    STEAMLEARN_INFERENCE_METADATA_ERROR_INVALID_PROJECT_ID = 2,
    STEAMLEARN_INFERENCE_METADATA_ERROR_NO_PUBLISHED_CONFIG = 3,
    STEAMLEARN_INFERENCE_METADATA_ERROR_FORBIDDEN = 4,
    STEAMLEARN_INFERENCE_METADATA_ERROR_INVALID_TIMESTAMP = 5,
    STEAMLEARN_INFERENCE_METADATA_ERROR_INVALID_PUBLISHED_VERSION = 6,
    STEAMLEARN_INFERENCE_METADATA_ERROR_NO_FETCH_ID_FOUND = 7
}
export declare function eSteamLearnInferenceMetadataResultFromJSON(object: any): ESteamLearnInferenceMetadataResult;
export declare function eSteamLearnInferenceMetadataResultToJSON(object: ESteamLearnInferenceMetadataResult): string;
export interface CMsgSteamLearnDataSourceDescObject {
    elements: CMsgSteamLearnDataSourceDescElement[];
}
export interface CMsgSteamLearnDataSourceDescElement {
    name: string;
    dataType: ESteamLearnDataType;
    object: CMsgSteamLearnDataSourceDescObject | undefined;
    count: number;
}
export interface CMsgSteamLearnDataSource {
    id: number;
    name: string;
    version: number;
    sourceDescription: string;
    structure: CMsgSteamLearnDataSourceDescObject | undefined;
    structureCrc: number;
    cacheDurationSeconds: number;
}
export interface CMsgSteamLearnDataObject {
    elements: CMsgSteamLearnDataElement[];
}
export interface CMsgSteamLearnDataElement {
    name: string;
    dataInt32s: number[];
    dataFloats: number[];
    dataBools: boolean[];
    dataStrings: string[];
    dataObjects: CMsgSteamLearnDataObject[];
}
export interface CMsgSteamLearnData {
    dataSourceId: number;
    keys: string[];
    dataObject: CMsgSteamLearnDataObject | undefined;
}
export interface CMsgSteamLearnDataList {
    data: CMsgSteamLearnData[];
}
export interface CMsgSteamLearnRegisterDataSourceRequest {
    accessToken: string;
    dataSource: CMsgSteamLearnDataSource | undefined;
}
export interface CMsgSteamLearnRegisterDataSourceResponse {
    result: ESteammLearnRegisterDataSourceResult;
    dataSource: CMsgSteamLearnDataSource | undefined;
}
export interface CMsgSteamLearnCacheDataRequest {
    accessToken: string;
    data: CMsgSteamLearnData | undefined;
}
export interface CMsgSteamLearnCacheDataResponse {
    cacheDataResult: ESteamLearnCacheDataResult;
}
export interface CMsgSteamLearnSnapshotProjectRequest {
    accessToken: string;
    projectId: number;
    publishedVersion: number;
    keys: string[];
    data: CMsgSteamLearnData[];
    pendingDataLimitSeconds: number;
}
export interface CMsgSteamLearnSnapshotProjectResponse {
    snapshotResult: ESteamLearnSnapshotProjectResult;
}
export interface CMsgSteamLearnBatchOperationRequest {
    cacheDataRequests: CMsgSteamLearnCacheDataRequest[];
    snapshotRequests: CMsgSteamLearnSnapshotProjectRequest[];
    inferenceRequests: CMsgSteamLearnInferenceRequest[];
}
export interface CMsgSteamLearnBatchOperationResponse {
    cacheDataResponses: CMsgSteamLearnCacheDataResponse[];
    snapshotResponses: CMsgSteamLearnSnapshotProjectResponse[];
    inferenceResponses: CMsgSteamLearnInferenceResponse[];
}
export interface CMsgSteamLearnAccessTokens {
    registerDataSourceAccessToken: string;
    cacheDataAccessTokens: CMsgSteamLearnAccessTokens_CacheDataAccessToken[];
    snapshotProjectAccessTokens: CMsgSteamLearnAccessTokens_SnapshotProjectAccessToken[];
    inferenceAccessTokens: CMsgSteamLearnAccessTokens_InferenceAccessToken[];
}
export interface CMsgSteamLearnAccessTokens_CacheDataAccessToken {
    dataSourceId: number;
    accessToken: string;
}
export interface CMsgSteamLearnAccessTokens_SnapshotProjectAccessToken {
    projectId: number;
    accessToken: string;
}
export interface CMsgSteamLearnAccessTokens_InferenceAccessToken {
    projectId: number;
    accessToken: string;
}
export interface CMsgSteamLearnGetAccessTokensRequest {
    appid: number;
}
export interface CMsgSteamLearnGetAccessTokensResponse {
    result: ESteamLearnGetAccessTokensResult;
    accessTokens: CMsgSteamLearnAccessTokens | undefined;
}
export interface CMsgSteamLearnInferenceRequest {
    accessToken: string;
    projectId: number;
    publishedVersion: number;
    overrideTrainId: number;
    data: CMsgSteamLearnDataList | undefined;
    additionalData: number[];
}
export interface CMsgSteamLearnInferenceMetadataRequest {
    accessToken: string;
    projectId: number;
    publishedVersion: number;
    overrideTrainId: number;
}
export interface CMsgSteamLearnInferenceMetadataBackendRequest {
    projectId: number;
    fetchId: number;
}
export interface CMsgSteamLearnInferenceMetadataResponse {
    inferenceMetadataResult: ESteamLearnInferenceMetadataResult;
    rowRange: CMsgSteamLearnInferenceMetadataResponse_RowRange | undefined;
    ranges: CMsgSteamLearnInferenceMetadataResponse_Range[];
    stdDevs: CMsgSteamLearnInferenceMetadataResponse_StdDev[];
    compactTables: CMsgSteamLearnInferenceMetadataResponse_CompactTable[];
    sequenceTables: CMsgSteamLearnInferenceMetadataResponse_SequenceTable[];
    kmeans: CMsgSteamLearnInferenceMetadataResponse_KMeans[];
    appInfo: CMsgSteamLearnInferenceMetadataResponse_AppInfoEntry[];
    snapshotHistogram: CMsgSteamLearnInferenceMetadataResponse_SnapshotHistogram | undefined;
}
export interface CMsgSteamLearnInferenceMetadataResponse_RowRange {
    minRow: string;
    maxRow: string;
}
export interface CMsgSteamLearnInferenceMetadataResponse_Range {
    dataElementPath: string;
    minValue: number;
    maxValue: number;
}
export interface CMsgSteamLearnInferenceMetadataResponse_StdDev {
    dataElementPath: string;
    mean: number;
    stdDev: number;
}
export interface CMsgSteamLearnInferenceMetadataResponse_CompactTable {
    name: string;
    mapValues: CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapValuesEntry[];
    mapMappings: CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapMappingsEntry[];
}
export interface CMsgSteamLearnInferenceMetadataResponse_CompactTable_Entry {
    value: number;
    mapping: number;
    count: string;
}
export interface CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapValuesEntry {
    key: number;
    value: CMsgSteamLearnInferenceMetadataResponse_CompactTable_Entry | undefined;
}
export interface CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapMappingsEntry {
    key: number;
    value: CMsgSteamLearnInferenceMetadataResponse_CompactTable_Entry | undefined;
}
export interface CMsgSteamLearnInferenceMetadataResponse_SequenceTable {
    name: string;
    mapValues: CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapValuesEntry[];
    mapMappings: CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapMappingsEntry[];
    totalCount: string;
}
export interface CMsgSteamLearnInferenceMetadataResponse_SequenceTable_Entry {
    values: number[];
    crc: number;
    count: number;
}
export interface CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapValuesEntry {
    key: number;
    value: CMsgSteamLearnInferenceMetadataResponse_SequenceTable_Entry | undefined;
}
export interface CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapMappingsEntry {
    key: string;
    value: CMsgSteamLearnInferenceMetadataResponse_SequenceTable_Entry | undefined;
}
export interface CMsgSteamLearnInferenceMetadataResponse_KMeans {
    name: string;
    clusters: CMsgSteamLearnInferenceMetadataResponse_KMeans_Cluster[];
}
export interface CMsgSteamLearnInferenceMetadataResponse_KMeans_Cluster {
    x: number;
    y: number;
    radius: number;
    radius75pct: number;
    radius50pct: number;
    radius25pct: number;
}
export interface CMsgSteamLearnInferenceMetadataResponse_SnapshotHistogram {
    minValue: number;
    maxValue: number;
    numBuckets: number;
    bucketCounts: number[];
}
export interface CMsgSteamLearnInferenceMetadataResponse_AppInfo {
    countryAllow: string;
    countryDeny: string;
    platformWin: boolean;
    platformMac: boolean;
    platformLinux: boolean;
    adultViolence: boolean;
    adultSex: boolean;
}
export interface CMsgSteamLearnInferenceMetadataResponse_AppInfoEntry {
    key: number;
    value: CMsgSteamLearnInferenceMetadataResponse_AppInfo | undefined;
}
export interface CMsgSteamLearnInferenceBackendResponse {
    outputs: CMsgSteamLearnInferenceBackendResponse_Output[];
}
export interface CMsgSteamLearnInferenceBackendResponse_Sequence {
    value: number[];
}
export interface CMsgSteamLearnInferenceBackendResponse_RegressionOutput {
    value: number;
}
export interface CMsgSteamLearnInferenceBackendResponse_BinaryCrossEntropyOutput {
    value: number;
}
export interface CMsgSteamLearnInferenceBackendResponse_MutliBinaryCrossEntropyOutput {
    weight: number[];
    value: number[];
    valueSequence: CMsgSteamLearnInferenceBackendResponse_Sequence[];
}
export interface CMsgSteamLearnInferenceBackendResponse_CategoricalCrossEntropyOutput {
    weight: number[];
    value: number[];
    valueSequence: CMsgSteamLearnInferenceBackendResponse_Sequence[];
}
export interface CMsgSteamLearnInferenceBackendResponse_Output {
    binaryCrossentropy?: CMsgSteamLearnInferenceBackendResponse_BinaryCrossEntropyOutput | undefined;
    categoricalCrossentropy?: CMsgSteamLearnInferenceBackendResponse_CategoricalCrossEntropyOutput | undefined;
    multiBinaryCrossentropy?: CMsgSteamLearnInferenceBackendResponse_MutliBinaryCrossEntropyOutput | undefined;
    regression?: CMsgSteamLearnInferenceBackendResponse_RegressionOutput | undefined;
}
export interface CMsgSteamLearnInferenceResponse {
    inferenceResult: ESteamLearnInferenceResult;
    backendResponse: CMsgSteamLearnInferenceBackendResponse | undefined;
    keys: string[];
}
export declare const CMsgSteamLearnDataSourceDescObject: MessageFns<CMsgSteamLearnDataSourceDescObject>;
export declare const CMsgSteamLearnDataSourceDescElement: MessageFns<CMsgSteamLearnDataSourceDescElement>;
export declare const CMsgSteamLearnDataSource: MessageFns<CMsgSteamLearnDataSource>;
export declare const CMsgSteamLearnDataObject: MessageFns<CMsgSteamLearnDataObject>;
export declare const CMsgSteamLearnDataElement: MessageFns<CMsgSteamLearnDataElement>;
export declare const CMsgSteamLearnData: MessageFns<CMsgSteamLearnData>;
export declare const CMsgSteamLearnDataList: MessageFns<CMsgSteamLearnDataList>;
export declare const CMsgSteamLearnRegisterDataSourceRequest: MessageFns<CMsgSteamLearnRegisterDataSourceRequest>;
export declare const CMsgSteamLearnRegisterDataSourceResponse: MessageFns<CMsgSteamLearnRegisterDataSourceResponse>;
export declare const CMsgSteamLearnCacheDataRequest: MessageFns<CMsgSteamLearnCacheDataRequest>;
export declare const CMsgSteamLearnCacheDataResponse: MessageFns<CMsgSteamLearnCacheDataResponse>;
export declare const CMsgSteamLearnSnapshotProjectRequest: MessageFns<CMsgSteamLearnSnapshotProjectRequest>;
export declare const CMsgSteamLearnSnapshotProjectResponse: MessageFns<CMsgSteamLearnSnapshotProjectResponse>;
export declare const CMsgSteamLearnBatchOperationRequest: MessageFns<CMsgSteamLearnBatchOperationRequest>;
export declare const CMsgSteamLearnBatchOperationResponse: MessageFns<CMsgSteamLearnBatchOperationResponse>;
export declare const CMsgSteamLearnAccessTokens: MessageFns<CMsgSteamLearnAccessTokens>;
export declare const CMsgSteamLearnAccessTokens_CacheDataAccessToken: MessageFns<CMsgSteamLearnAccessTokens_CacheDataAccessToken>;
export declare const CMsgSteamLearnAccessTokens_SnapshotProjectAccessToken: MessageFns<CMsgSteamLearnAccessTokens_SnapshotProjectAccessToken>;
export declare const CMsgSteamLearnAccessTokens_InferenceAccessToken: MessageFns<CMsgSteamLearnAccessTokens_InferenceAccessToken>;
export declare const CMsgSteamLearnGetAccessTokensRequest: MessageFns<CMsgSteamLearnGetAccessTokensRequest>;
export declare const CMsgSteamLearnGetAccessTokensResponse: MessageFns<CMsgSteamLearnGetAccessTokensResponse>;
export declare const CMsgSteamLearnInferenceRequest: MessageFns<CMsgSteamLearnInferenceRequest>;
export declare const CMsgSteamLearnInferenceMetadataRequest: MessageFns<CMsgSteamLearnInferenceMetadataRequest>;
export declare const CMsgSteamLearnInferenceMetadataBackendRequest: MessageFns<CMsgSteamLearnInferenceMetadataBackendRequest>;
export declare const CMsgSteamLearnInferenceMetadataResponse: MessageFns<CMsgSteamLearnInferenceMetadataResponse>;
export declare const CMsgSteamLearnInferenceMetadataResponse_RowRange: MessageFns<CMsgSteamLearnInferenceMetadataResponse_RowRange>;
export declare const CMsgSteamLearnInferenceMetadataResponse_Range: MessageFns<CMsgSteamLearnInferenceMetadataResponse_Range>;
export declare const CMsgSteamLearnInferenceMetadataResponse_StdDev: MessageFns<CMsgSteamLearnInferenceMetadataResponse_StdDev>;
export declare const CMsgSteamLearnInferenceMetadataResponse_CompactTable: MessageFns<CMsgSteamLearnInferenceMetadataResponse_CompactTable>;
export declare const CMsgSteamLearnInferenceMetadataResponse_CompactTable_Entry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_CompactTable_Entry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapValuesEntry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapValuesEntry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapMappingsEntry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_CompactTable_MapMappingsEntry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_SequenceTable: MessageFns<CMsgSteamLearnInferenceMetadataResponse_SequenceTable>;
export declare const CMsgSteamLearnInferenceMetadataResponse_SequenceTable_Entry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_SequenceTable_Entry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapValuesEntry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapValuesEntry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapMappingsEntry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_SequenceTable_MapMappingsEntry>;
export declare const CMsgSteamLearnInferenceMetadataResponse_KMeans: MessageFns<CMsgSteamLearnInferenceMetadataResponse_KMeans>;
export declare const CMsgSteamLearnInferenceMetadataResponse_KMeans_Cluster: MessageFns<CMsgSteamLearnInferenceMetadataResponse_KMeans_Cluster>;
export declare const CMsgSteamLearnInferenceMetadataResponse_SnapshotHistogram: MessageFns<CMsgSteamLearnInferenceMetadataResponse_SnapshotHistogram>;
export declare const CMsgSteamLearnInferenceMetadataResponse_AppInfo: MessageFns<CMsgSteamLearnInferenceMetadataResponse_AppInfo>;
export declare const CMsgSteamLearnInferenceMetadataResponse_AppInfoEntry: MessageFns<CMsgSteamLearnInferenceMetadataResponse_AppInfoEntry>;
export declare const CMsgSteamLearnInferenceBackendResponse: MessageFns<CMsgSteamLearnInferenceBackendResponse>;
export declare const CMsgSteamLearnInferenceBackendResponse_Sequence: MessageFns<CMsgSteamLearnInferenceBackendResponse_Sequence>;
export declare const CMsgSteamLearnInferenceBackendResponse_RegressionOutput: MessageFns<CMsgSteamLearnInferenceBackendResponse_RegressionOutput>;
export declare const CMsgSteamLearnInferenceBackendResponse_BinaryCrossEntropyOutput: MessageFns<CMsgSteamLearnInferenceBackendResponse_BinaryCrossEntropyOutput>;
export declare const CMsgSteamLearnInferenceBackendResponse_MutliBinaryCrossEntropyOutput: MessageFns<CMsgSteamLearnInferenceBackendResponse_MutliBinaryCrossEntropyOutput>;
export declare const CMsgSteamLearnInferenceBackendResponse_CategoricalCrossEntropyOutput: MessageFns<CMsgSteamLearnInferenceBackendResponse_CategoricalCrossEntropyOutput>;
export declare const CMsgSteamLearnInferenceBackendResponse_Output: MessageFns<CMsgSteamLearnInferenceBackendResponse_Output>;
export declare const CMsgSteamLearnInferenceResponse: MessageFns<CMsgSteamLearnInferenceResponse>;
export interface SteamLearn {
    RegisterDataSource(request: CMsgSteamLearnRegisterDataSourceRequest): Promise<CMsgSteamLearnRegisterDataSourceResponse>;
    CacheData(request: CMsgSteamLearnCacheDataRequest): Promise<CMsgSteamLearnCacheDataResponse>;
    SnapshotProject(request: CMsgSteamLearnSnapshotProjectRequest): Promise<CMsgSteamLearnSnapshotProjectResponse>;
    BatchOperation(request: CMsgSteamLearnBatchOperationRequest): Promise<CMsgSteamLearnBatchOperationResponse>;
    GetAccessTokens(request: CMsgSteamLearnGetAccessTokensRequest): Promise<CMsgSteamLearnGetAccessTokensResponse>;
    Inference(request: CMsgSteamLearnInferenceRequest): Promise<CMsgSteamLearnInferenceResponse>;
    InferenceMetadata(request: CMsgSteamLearnInferenceMetadataRequest): Promise<CMsgSteamLearnInferenceMetadataResponse>;
}
export declare const SteamLearnServiceName = "SteamLearn";
export declare class SteamLearnClientImpl implements SteamLearn {
    private readonly rpc;
    private readonly service;
    constructor(rpc: Rpc, opts?: {
        service?: string;
    });
    RegisterDataSource(request: CMsgSteamLearnRegisterDataSourceRequest): Promise<CMsgSteamLearnRegisterDataSourceResponse>;
    CacheData(request: CMsgSteamLearnCacheDataRequest): Promise<CMsgSteamLearnCacheDataResponse>;
    SnapshotProject(request: CMsgSteamLearnSnapshotProjectRequest): Promise<CMsgSteamLearnSnapshotProjectResponse>;
    BatchOperation(request: CMsgSteamLearnBatchOperationRequest): Promise<CMsgSteamLearnBatchOperationResponse>;
    GetAccessTokens(request: CMsgSteamLearnGetAccessTokensRequest): Promise<CMsgSteamLearnGetAccessTokensResponse>;
    Inference(request: CMsgSteamLearnInferenceRequest): Promise<CMsgSteamLearnInferenceResponse>;
    InferenceMetadata(request: CMsgSteamLearnInferenceMetadataRequest): Promise<CMsgSteamLearnInferenceMetadataResponse>;
}
interface Rpc {
    request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}
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
//# sourceMappingURL=steammessages_steamlearn.steamworkssdk.d.ts.map