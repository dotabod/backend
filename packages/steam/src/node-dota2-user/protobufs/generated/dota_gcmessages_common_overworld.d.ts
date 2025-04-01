import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CMsgDOTAClaimEventActionResponse } from "./dota_gcmessages_common";
import { CMsgSurvivorsUserData } from "./dota_gcmessages_common_survivors";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
export declare enum EOverworldNodeState {
    k_eOverworldNodeState_Invalid = 0,
    k_eOverworldNodeState_Locked = 1,
    k_eOverworldNodeState_Unlocked = 2
}
export declare function eOverworldNodeStateFromJSON(object: any): EOverworldNodeState;
export declare function eOverworldNodeStateToJSON(object: EOverworldNodeState): string;
export declare enum EOverworldPathState {
    k_eOverworldPathState_Invalid = 0,
    k_eOverworldPathState_Incomplete = 1,
    k_eOverworldPathState_Complete = 2
}
export declare function eOverworldPathStateFromJSON(object: any): EOverworldPathState;
export declare function eOverworldPathStateToJSON(object: EOverworldPathState): string;
export declare enum EOverworldAuditAction {
    k_eOverworldAuditAction_Invalid = 0,
    k_eOverworldAuditAction_DevModifyTokens = 1,
    k_eOverworldAuditAction_DevClearInventory = 2,
    k_eOverworldAuditAction_DevGrantTokens = 3,
    k_eOverworldAuditAction_CompletePath = 4,
    k_eOverworldAuditAction_ClaimEncounterReward = 5,
    k_eOverworldAuditAction_DevResetNode = 6,
    k_eOverworldAuditAction_DevResetPath = 7,
    k_eOverworldAuditAction_MatchRewardsFull = 8,
    k_eOverworldAuditAction_MatchRewardsHalf = 9,
    k_eOverworldAuditAction_EventActionTokenGrant = 10,
    k_eOverworldAuditAction_TokenTraderLost = 11,
    k_eOverworldAuditAction_TokenTraderGained = 12,
    k_eOverworldAuditAction_EncounterRewardTokenCost = 13,
    k_eOverworldAuditAction_EncounterRewardTokenReward = 14,
    k_eOverworldAuditAction_SupportGrantTokens = 16,
    k_eOverworldAuditAction_TokenGiftSent = 17
}
export declare function eOverworldAuditActionFromJSON(object: any): EOverworldAuditAction;
export declare function eOverworldAuditActionToJSON(object: EOverworldAuditAction): string;
export declare enum EOverworldMinigameAction {
    k_eOverworldMinigameAction_Invalid = 0,
    k_eOverworldMinigameAction_DevReset = 1,
    k_eOverworldMinigameAction_DevGiveCurrency = 2,
    k_eOverworldMinigameAction_Purchase = 3,
    k_eOverworldMinigameAction_SetOption = 4,
    k_eOverworldMinigameAction_ReportCurrencyGained = 5,
    k_eOverworldMinigameAction_UnlockDifficulty = 6
}
export declare function eOverworldMinigameActionFromJSON(object: any): EOverworldMinigameAction;
export declare function eOverworldMinigameActionToJSON(object: EOverworldMinigameAction): string;
export interface CMsgOverworldTokenCount {
    tokenId: number;
    tokenCount: number;
}
export interface CMsgOverworldTokenQuantity {
    tokenCounts: CMsgOverworldTokenCount[];
}
export interface CMsgOverworldEncounterTokenTreasureData {
    rewardOptions: CMsgOverworldEncounterTokenTreasureData_RewardOption[];
}
export interface CMsgOverworldEncounterTokenTreasureData_RewardOption {
    rewardData: number;
    tokenCost: CMsgOverworldTokenQuantity | undefined;
    tokenReward: CMsgOverworldTokenQuantity | undefined;
}
export interface CMsgOverworldEncounterTokenQuestData {
    quests: CMsgOverworldEncounterTokenQuestData_Quest[];
}
export interface CMsgOverworldEncounterTokenQuestData_Quest {
    rewardData: number;
    tokenCost: CMsgOverworldTokenQuantity | undefined;
    tokenReward: CMsgOverworldTokenQuantity | undefined;
}
export interface CMsgOverworldHeroList {
    heroIds: number[];
}
export interface CMsgOverworldEncounterChooseHeroData {
    heroList: CMsgOverworldHeroList | undefined;
    additive: boolean;
}
export interface CMsgOverworldEncounterProgressData {
    choice: number;
    progress: number;
    maxProgress: number;
    visited: boolean;
}
export interface CMsgOverworldEncounterData {
    extraEncounterData: CExtraMsgBlock[];
}
export interface CMsgOverworldNode {
    nodeId: number;
    nodeState: EOverworldNodeState;
    nodeEncounterData: CMsgOverworldEncounterData | undefined;
}
export interface CMsgOverworldPath {
    pathId: number;
    pathCost: CMsgOverworldTokenQuantity | undefined;
    pathState: EOverworldPathState;
}
export interface CMsgOverworldMinigameCustomData {
    survivorsData?: CMsgSurvivorsUserData | undefined;
}
export interface CMsgOverworldMinigameUserData {
    nodeId: number;
    currencyAmount: number;
    customData: CMsgOverworldMinigameCustomData | undefined;
}
export interface CMsgOverworldUserData {
    tokenInventory: CMsgOverworldTokenQuantity | undefined;
    overworldNodes: CMsgOverworldNode[];
    overworldPaths: CMsgOverworldPath[];
    currentNodeId: number;
    minigameData: CMsgOverworldUserData_MinigameDataEntry[];
}
export interface CMsgOverworldUserData_MinigameDataEntry {
    key: number;
    value: CMsgOverworldMinigameUserData | undefined;
}
export interface CMsgOverworldMatchRewards {
    players: CMsgOverworldMatchRewards_Player[];
}
export interface CMsgOverworldMatchRewards_Player {
    playerSlot: number;
    tokens: CMsgOverworldTokenQuantity | undefined;
    overworldId: number;
}
export interface CMsgClientToGCOverworldGetUserData {
    overworldId: number;
}
export interface CMsgClientToGCOverworldGetUserDataResponse {
    response: CMsgClientToGCOverworldGetUserDataResponse_EResponse;
    userData: CMsgOverworldUserData | undefined;
}
export declare enum CMsgClientToGCOverworldGetUserDataResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5
}
export declare function cMsgClientToGCOverworldGetUserDataResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldGetUserDataResponse_EResponse;
export declare function cMsgClientToGCOverworldGetUserDataResponse_EResponseToJSON(object: CMsgClientToGCOverworldGetUserDataResponse_EResponse): string;
export interface CMsgGCToClientOverworldUserDataUpdated {
    overworldId: number;
    userData: CMsgOverworldUserData | undefined;
}
export interface CMsgClientToGCOverworldCompletePath {
    overworldId: number;
    pathId: number;
}
export interface CMsgClientToGCOverworldCompletePathResponse {
    response: CMsgClientToGCOverworldCompletePathResponse_EResponse;
    claimResponse: CMsgDOTAClaimEventActionResponse | undefined;
}
export declare enum CMsgClientToGCOverworldCompletePathResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5,
    k_eInvalidPath = 6,
    k_eNotEnoughTokens = 7,
    k_ePathIsLocked = 8,
    k_ePathAlreadyUnlocked = 9
}
export declare function cMsgClientToGCOverworldCompletePathResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldCompletePathResponse_EResponse;
export declare function cMsgClientToGCOverworldCompletePathResponse_EResponseToJSON(object: CMsgClientToGCOverworldCompletePathResponse_EResponse): string;
export interface CMsgOverworldEncounterPitFighterRewardData {
    tokenId: number;
    choice: number;
}
export interface CMsgClientToGCOverworldClaimEncounterReward {
    overworldId: number;
    nodeId: number;
    rewardData: number;
    periodicResourceId: number;
    extraRewardData: CMsgOverworldEncounterData | undefined;
    leaderboardData: number;
    leaderboardIndex: number;
}
export interface CMsgClientToGCOverworldClaimEncounterRewardResponse {
    response: CMsgClientToGCOverworldClaimEncounterRewardResponse_EResponse;
    claimResponse: CMsgDOTAClaimEventActionResponse | undefined;
    tokensReceived: CMsgOverworldTokenQuantity | undefined;
}
export declare enum CMsgClientToGCOverworldClaimEncounterRewardResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5,
    k_eInvalidNode = 6,
    k_eNodeLocked = 7,
    k_eRewardAlreadyClaimed = 8,
    k_eNodeNotEncounter = 9,
    k_eEncounterMissingRewards = 10,
    k_eInvalidEncounterRewardStyle = 11,
    k_eInvalidEncounterData = 12,
    k_eNotEnoughTokensForReward = 13,
    k_eNotEnoughResourceForReward = 14,
    k_eInvalidRewardData = 15
}
export declare function cMsgClientToGCOverworldClaimEncounterRewardResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldClaimEncounterRewardResponse_EResponse;
export declare function cMsgClientToGCOverworldClaimEncounterRewardResponse_EResponseToJSON(object: CMsgClientToGCOverworldClaimEncounterRewardResponse_EResponse): string;
export interface CMsgClientToGCOverworldVisitEncounter {
    overworldId: number;
    nodeId: number;
}
export interface CMsgClientToGCOverworldVisitEncounterResponse {
    response: CMsgClientToGCOverworldVisitEncounterResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldVisitEncounterResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5,
    k_eInvalidNode = 6,
    k_eNodeLocked = 7,
    k_eNodeNotEncounter = 8,
    k_eAlreadyVisited = 9
}
export declare function cMsgClientToGCOverworldVisitEncounterResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldVisitEncounterResponse_EResponse;
export declare function cMsgClientToGCOverworldVisitEncounterResponse_EResponseToJSON(object: CMsgClientToGCOverworldVisitEncounterResponse_EResponse): string;
export interface CMsgClientToGCOverworldMoveToNode {
    overworldId: number;
    nodeId: number;
}
export interface CMsgClientToGCOverworldMoveToNodeResponse {
    response: CMsgClientToGCOverworldMoveToNodeResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldMoveToNodeResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5,
    k_eInvalidNode = 6,
    k_eNodeLocked = 7
}
export declare function cMsgClientToGCOverworldMoveToNodeResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldMoveToNodeResponse_EResponse;
export declare function cMsgClientToGCOverworldMoveToNodeResponse_EResponseToJSON(object: CMsgClientToGCOverworldMoveToNodeResponse_EResponse): string;
export interface CMsgClientToGCOverworldTradeTokens {
    overworldId: number;
    tokenOffer: CMsgOverworldTokenQuantity | undefined;
    tokenRequest: CMsgOverworldTokenQuantity | undefined;
    recipe: number;
    encounterId: number;
}
export interface CMsgClientToGCOverworldTradeTokensResponse {
    response: CMsgClientToGCOverworldTradeTokensResponse_EResponse;
    tokensReceived: CMsgOverworldTokenQuantity | undefined;
}
export declare enum CMsgClientToGCOverworldTradeTokensResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eNodeLocked = 6,
    k_eInvalidOverworld = 7,
    k_eInvalidOffer = 8,
    k_eNotEnoughTokens = 9,
    k_eInvalidNode = 10,
    k_eInvalidEncounter = 11,
    k_eRewardDoesNotMatchRecipe = 12
}
export declare function cMsgClientToGCOverworldTradeTokensResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldTradeTokensResponse_EResponse;
export declare function cMsgClientToGCOverworldTradeTokensResponse_EResponseToJSON(object: CMsgClientToGCOverworldTradeTokensResponse_EResponse): string;
export interface CMsgClientToGCOverworldGiftTokens {
    overworldId: number;
    tokenGift: CMsgOverworldTokenCount | undefined;
    recipientAccountId: number;
    periodicResourceId: number;
}
export interface CMsgClientToGCOverworldGiftTokensResponse {
    response: CMsgClientToGCOverworldGiftTokensResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldGiftTokensResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eNodeLocked = 6,
    k_eInvalidOverworld = 7,
    k_eInvalidGift = 8,
    k_eNotEnoughTokens = 9,
    k_eInvalidRecipient = 10,
    k_eNotEnoughPeriodicResource = 11
}
export declare function cMsgClientToGCOverworldGiftTokensResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldGiftTokensResponse_EResponse;
export declare function cMsgClientToGCOverworldGiftTokensResponse_EResponseToJSON(object: CMsgClientToGCOverworldGiftTokensResponse_EResponse): string;
export interface CMsgClientToGCOverworldRequestTokensNeededByFriend {
    friendAccountId: number;
    overworldId: number;
}
export interface CMsgClientToGCOverworldRequestTokensNeededByFriendResponse {
    response: CMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponse;
    tokenQuantity: CMsgOverworldTokenQuantity | undefined;
}
export declare enum CMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eNodeLocked = 6,
    k_eInvalidOverworld = 7,
    k_eInvalidFriend = 8,
    k_eTooManyRequests = 9
}
export declare function cMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponse;
export declare function cMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponseToJSON(object: CMsgClientToGCOverworldRequestTokensNeededByFriendResponse_EResponse): string;
export interface CMsgClientToGCOverworldDevResetAll {
    overworldId: number;
}
export interface CMsgClientToGCOverworldDevResetAllResponse {
    response: CMsgClientToGCOverworldDevResetAllResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldDevResetAllResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidOverworld = 6
}
export declare function cMsgClientToGCOverworldDevResetAllResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldDevResetAllResponse_EResponse;
export declare function cMsgClientToGCOverworldDevResetAllResponse_EResponseToJSON(object: CMsgClientToGCOverworldDevResetAllResponse_EResponse): string;
export interface CMsgClientToGCOverworldDevResetNode {
    overworldId: number;
    nodeId: number;
}
export interface CMsgClientToGCOverworldDevResetNodeResponse {
    response: CMsgClientToGCOverworldDevResetNodeResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldDevResetNodeResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidOverworld = 6,
    k_eInvalidNode = 7
}
export declare function cMsgClientToGCOverworldDevResetNodeResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldDevResetNodeResponse_EResponse;
export declare function cMsgClientToGCOverworldDevResetNodeResponse_EResponseToJSON(object: CMsgClientToGCOverworldDevResetNodeResponse_EResponse): string;
export interface CMsgClientToGCOverworldDevGrantTokens {
    overworldId: number;
    tokenQuantity: CMsgOverworldTokenQuantity | undefined;
}
export interface CMsgClientToGCOverworldDevGrantTokensResponse {
    response: CMsgClientToGCOverworldDevGrantTokensResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldDevGrantTokensResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidOverworld = 6
}
export declare function cMsgClientToGCOverworldDevGrantTokensResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldDevGrantTokensResponse_EResponse;
export declare function cMsgClientToGCOverworldDevGrantTokensResponse_EResponseToJSON(object: CMsgClientToGCOverworldDevGrantTokensResponse_EResponse): string;
export interface CMsgClientToGCOverworldDevClearInventory {
    overworldId: number;
}
export interface CMsgClientToGCOverworldDevClearInventoryResponse {
    response: CMsgClientToGCOverworldDevClearInventoryResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldDevClearInventoryResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidOverworld = 6
}
export declare function cMsgClientToGCOverworldDevClearInventoryResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldDevClearInventoryResponse_EResponse;
export declare function cMsgClientToGCOverworldDevClearInventoryResponse_EResponseToJSON(object: CMsgClientToGCOverworldDevClearInventoryResponse_EResponse): string;
export interface CMsgClientToGCOverworldFeedback {
    language: number;
    overworldId: number;
    feedback: string;
}
export interface CMsgClientToGCOverworldFeedbackResponse {
    response: CMsgClientToGCOverworldFeedbackResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldFeedbackResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eNotAllowed = 5,
    k_eInvalidOverworld = 6
}
export declare function cMsgClientToGCOverworldFeedbackResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldFeedbackResponse_EResponse;
export declare function cMsgClientToGCOverworldFeedbackResponse_EResponseToJSON(object: CMsgClientToGCOverworldFeedbackResponse_EResponse): string;
export interface CMsgClientToGCOverworldGetDynamicImage {
    magic: number;
    imageId: number;
    language: number;
}
export interface CMsgClientToGCOverworldGetDynamicImageResponse {
    imageId: number;
    images: CMsgClientToGCOverworldGetDynamicImageResponse_Image[];
}
export declare enum CMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormat {
    k_eUnknown = 0,
    k_ePNG = 1,
    k_eData = 2
}
export declare function cMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormatFromJSON(object: any): CMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormat;
export declare function cMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormatToJSON(object: CMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormat): string;
export interface CMsgClientToGCOverworldGetDynamicImageResponse_Image {
    width: number;
    height: number;
    format: CMsgClientToGCOverworldGetDynamicImageResponse_EDynamicImageFormat;
    imageBytes: Buffer;
}
export interface CMsgClientToGCOverworldMinigameAction {
    overworldId: number;
    nodeId: number;
    action: EOverworldMinigameAction;
    selection: number;
    optionValue: number;
    currencyAmount: number;
}
export interface CMsgClientToGCOverworldMinigameActionResponse {
    response: CMsgClientToGCOverworldMinigameActionResponse_EResponse;
}
export declare enum CMsgClientToGCOverworldMinigameActionResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidOverworld = 5,
    k_eInvalidNode = 6,
    k_eNodeLocked = 7,
    k_eInvalidSelection = 8,
    k_eNotEnoughTokens = 9,
    k_eNotEnoughMinigameCurrency = 10,
    k_eNotAllowed = 11
}
export declare function cMsgClientToGCOverworldMinigameActionResponse_EResponseFromJSON(object: any): CMsgClientToGCOverworldMinigameActionResponse_EResponse;
export declare function cMsgClientToGCOverworldMinigameActionResponse_EResponseToJSON(object: CMsgClientToGCOverworldMinigameActionResponse_EResponse): string;
export declare const CMsgOverworldTokenCount: MessageFns<CMsgOverworldTokenCount>;
export declare const CMsgOverworldTokenQuantity: MessageFns<CMsgOverworldTokenQuantity>;
export declare const CMsgOverworldEncounterTokenTreasureData: MessageFns<CMsgOverworldEncounterTokenTreasureData>;
export declare const CMsgOverworldEncounterTokenTreasureData_RewardOption: MessageFns<CMsgOverworldEncounterTokenTreasureData_RewardOption>;
export declare const CMsgOverworldEncounterTokenQuestData: MessageFns<CMsgOverworldEncounterTokenQuestData>;
export declare const CMsgOverworldEncounterTokenQuestData_Quest: MessageFns<CMsgOverworldEncounterTokenQuestData_Quest>;
export declare const CMsgOverworldHeroList: MessageFns<CMsgOverworldHeroList>;
export declare const CMsgOverworldEncounterChooseHeroData: MessageFns<CMsgOverworldEncounterChooseHeroData>;
export declare const CMsgOverworldEncounterProgressData: MessageFns<CMsgOverworldEncounterProgressData>;
export declare const CMsgOverworldEncounterData: MessageFns<CMsgOverworldEncounterData>;
export declare const CMsgOverworldNode: MessageFns<CMsgOverworldNode>;
export declare const CMsgOverworldPath: MessageFns<CMsgOverworldPath>;
export declare const CMsgOverworldMinigameCustomData: MessageFns<CMsgOverworldMinigameCustomData>;
export declare const CMsgOverworldMinigameUserData: MessageFns<CMsgOverworldMinigameUserData>;
export declare const CMsgOverworldUserData: MessageFns<CMsgOverworldUserData>;
export declare const CMsgOverworldUserData_MinigameDataEntry: MessageFns<CMsgOverworldUserData_MinigameDataEntry>;
export declare const CMsgOverworldMatchRewards: MessageFns<CMsgOverworldMatchRewards>;
export declare const CMsgOverworldMatchRewards_Player: MessageFns<CMsgOverworldMatchRewards_Player>;
export declare const CMsgClientToGCOverworldGetUserData: MessageFns<CMsgClientToGCOverworldGetUserData>;
export declare const CMsgClientToGCOverworldGetUserDataResponse: MessageFns<CMsgClientToGCOverworldGetUserDataResponse>;
export declare const CMsgGCToClientOverworldUserDataUpdated: MessageFns<CMsgGCToClientOverworldUserDataUpdated>;
export declare const CMsgClientToGCOverworldCompletePath: MessageFns<CMsgClientToGCOverworldCompletePath>;
export declare const CMsgClientToGCOverworldCompletePathResponse: MessageFns<CMsgClientToGCOverworldCompletePathResponse>;
export declare const CMsgOverworldEncounterPitFighterRewardData: MessageFns<CMsgOverworldEncounterPitFighterRewardData>;
export declare const CMsgClientToGCOverworldClaimEncounterReward: MessageFns<CMsgClientToGCOverworldClaimEncounterReward>;
export declare const CMsgClientToGCOverworldClaimEncounterRewardResponse: MessageFns<CMsgClientToGCOverworldClaimEncounterRewardResponse>;
export declare const CMsgClientToGCOverworldVisitEncounter: MessageFns<CMsgClientToGCOverworldVisitEncounter>;
export declare const CMsgClientToGCOverworldVisitEncounterResponse: MessageFns<CMsgClientToGCOverworldVisitEncounterResponse>;
export declare const CMsgClientToGCOverworldMoveToNode: MessageFns<CMsgClientToGCOverworldMoveToNode>;
export declare const CMsgClientToGCOverworldMoveToNodeResponse: MessageFns<CMsgClientToGCOverworldMoveToNodeResponse>;
export declare const CMsgClientToGCOverworldTradeTokens: MessageFns<CMsgClientToGCOverworldTradeTokens>;
export declare const CMsgClientToGCOverworldTradeTokensResponse: MessageFns<CMsgClientToGCOverworldTradeTokensResponse>;
export declare const CMsgClientToGCOverworldGiftTokens: MessageFns<CMsgClientToGCOverworldGiftTokens>;
export declare const CMsgClientToGCOverworldGiftTokensResponse: MessageFns<CMsgClientToGCOverworldGiftTokensResponse>;
export declare const CMsgClientToGCOverworldRequestTokensNeededByFriend: MessageFns<CMsgClientToGCOverworldRequestTokensNeededByFriend>;
export declare const CMsgClientToGCOverworldRequestTokensNeededByFriendResponse: MessageFns<CMsgClientToGCOverworldRequestTokensNeededByFriendResponse>;
export declare const CMsgClientToGCOverworldDevResetAll: MessageFns<CMsgClientToGCOverworldDevResetAll>;
export declare const CMsgClientToGCOverworldDevResetAllResponse: MessageFns<CMsgClientToGCOverworldDevResetAllResponse>;
export declare const CMsgClientToGCOverworldDevResetNode: MessageFns<CMsgClientToGCOverworldDevResetNode>;
export declare const CMsgClientToGCOverworldDevResetNodeResponse: MessageFns<CMsgClientToGCOverworldDevResetNodeResponse>;
export declare const CMsgClientToGCOverworldDevGrantTokens: MessageFns<CMsgClientToGCOverworldDevGrantTokens>;
export declare const CMsgClientToGCOverworldDevGrantTokensResponse: MessageFns<CMsgClientToGCOverworldDevGrantTokensResponse>;
export declare const CMsgClientToGCOverworldDevClearInventory: MessageFns<CMsgClientToGCOverworldDevClearInventory>;
export declare const CMsgClientToGCOverworldDevClearInventoryResponse: MessageFns<CMsgClientToGCOverworldDevClearInventoryResponse>;
export declare const CMsgClientToGCOverworldFeedback: MessageFns<CMsgClientToGCOverworldFeedback>;
export declare const CMsgClientToGCOverworldFeedbackResponse: MessageFns<CMsgClientToGCOverworldFeedbackResponse>;
export declare const CMsgClientToGCOverworldGetDynamicImage: MessageFns<CMsgClientToGCOverworldGetDynamicImage>;
export declare const CMsgClientToGCOverworldGetDynamicImageResponse: MessageFns<CMsgClientToGCOverworldGetDynamicImageResponse>;
export declare const CMsgClientToGCOverworldGetDynamicImageResponse_Image: MessageFns<CMsgClientToGCOverworldGetDynamicImageResponse_Image>;
export declare const CMsgClientToGCOverworldMinigameAction: MessageFns<CMsgClientToGCOverworldMinigameAction>;
export declare const CMsgClientToGCOverworldMinigameActionResponse: MessageFns<CMsgClientToGCOverworldMinigameActionResponse>;
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
//# sourceMappingURL=dota_gcmessages_common_overworld.d.ts.map