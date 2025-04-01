import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CSOEconItem } from "./base_gcmessages";
import { EGCMsgResponse } from "./econ_shared_enums";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
export declare enum EGCItemMsg {
    k_EMsgGCBase = 1000,
    k_EMsgGCSetItemPosition = 1001,
    k_EMsgClientToGCPackBundle = 1002,
    k_EMsgClientToGCPackBundleResponse = 1003,
    k_EMsgGCDelete = 1004,
    k_EMsgGCVerifyCacheSubscription = 1005,
    k_EMsgClientToGCNameItem = 1006,
    k_EMsgGCPaintItem = 1009,
    k_EMsgGCPaintItemResponse = 1010,
    k_EMsgGCNameBaseItem = 1019,
    k_EMsgGCNameBaseItemResponse = 1020,
    k_EMsgGCUseItemRequest = 1025,
    k_EMsgGCUseItemResponse = 1026,
    k_EMsgGCGiftedItems = 1027,
    k_EMsgGCUnwrapGiftRequest = 1037,
    k_EMsgGCUnwrapGiftResponse = 1038,
    k_EMsgGCSortItems = 1041,
    k_EMsgGCBackpackSortFinished = 1058,
    k_EMsgGCAdjustItemEquippedState = 1059,
    k_EMsgGCItemAcknowledged = 1062,
    k_EMsgClientToGCNameItemResponse = 1068,
    k_EMsgGCApplyStrangePart = 1073,
    k_EMsgGCApplyPennantUpgrade = 1076,
    k_EMsgGCSetItemPositions = 1077,
    k_EMsgGCApplyEggEssence = 1078,
    k_EMsgGCNameEggEssenceResponse = 1079,
    k_EMsgGCExtractGems = 1086,
    k_EMsgGCAddSocket = 1087,
    k_EMsgGCAddItemToSocket = 1088,
    k_EMsgGCAddItemToSocketResponse = 1089,
    k_EMsgGCAddSocketResponse = 1090,
    k_EMsgGCResetStrangeGemCount = 1091,
    k_EMsgGCRequestCrateItems = 1092,
    k_EMsgGCRequestCrateItemsResponse = 1093,
    k_EMsgGCExtractGemsResponse = 1094,
    k_EMsgGCResetStrangeGemCountResponse = 1095,
    k_EMsgGCServerUseItemRequest = 1103,
    k_EMsgGCAddGiftItem = 1104,
    k_EMsgSQLGCToGCRevokeUntrustedGift = 1105,
    k_EMsgClientToGCRemoveItemGifterAttributes = 1109,
    k_EMsgClientToGCRemoveItemName = 1110,
    k_EMsgClientToGCRemoveItemDescription = 1111,
    k_EMsgClientToGCRemoveItemAttributeResponse = 1112,
    k_EMsgGCDev_NewItemRequest = 2001,
    k_EMsgGCDev_NewItemRequestResponse = 2002,
    k_EMsgGCDev_UnlockAllItemStylesRequest = 2003,
    k_EMsgGCDev_UnlockAllItemStylesResponse = 2004,
    k_EMsgGCStorePurchaseFinalize = 2504,
    k_EMsgGCStorePurchaseFinalizeResponse = 2505,
    k_EMsgGCStorePurchaseCancel = 2506,
    k_EMsgGCStorePurchaseCancelResponse = 2507,
    k_EMsgGCStorePurchaseInit = 2510,
    k_EMsgGCStorePurchaseInitResponse = 2511,
    k_EMsgGCToGCBannedWordListUpdated = 2515,
    k_EMsgGCToGCDirtySDOCache = 2516,
    k_EMsgGCToGCUpdateSQLKeyValue = 2518,
    k_EMsgGCToGCBroadcastConsoleCommand = 2521,
    k_EMsgGCServerVersionUpdated = 2522,
    k_EMsgGCApplyAutograph = 2523,
    k_EMsgGCToGCWebAPIAccountChanged = 2524,
    k_EMsgGCClientVersionUpdated = 2528,
    k_EMsgGCToGCUpdateWelcomeMsg = 2529,
    k_EMsgGCToGCPlayerStrangeCountAdjustments = 2535,
    k_EMsgGCRequestStoreSalesData = 2536,
    k_EMsgGCRequestStoreSalesDataResponse = 2537,
    k_EMsgGCRequestStoreSalesDataUpToDateResponse = 2538,
    k_EMsgGCToGCPingRequest = 2539,
    k_EMsgGCToGCPingResponse = 2540,
    k_EMsgGCToGCGetUserSessionServer = 2541,
    k_EMsgGCToGCGetUserSessionServerResponse = 2542,
    k_EMsgGCToGCGetUserServerMembers = 2543,
    k_EMsgGCToGCGetUserServerMembersResponse = 2544,
    k_EMsgGCToGCCanUseDropRateBonus = 2547,
    k_EMsgSQLAddDropRateBonus = 2548,
    k_EMsgGCToGCRefreshSOCache = 2549,
    k_EMsgGCToGCGrantAccountRolledItems = 2554,
    k_EMsgGCToGCGrantSelfMadeItemToAccount = 2555,
    k_EMsgGCStatueCraft = 2561,
    k_EMsgGCRedeemCode = 2562,
    k_EMsgGCRedeemCodeResponse = 2563,
    k_EMsgGCToGCItemConsumptionRollback = 2564,
    k_EMsgClientToGCWrapAndDeliverGift = 2565,
    k_EMsgClientToGCWrapAndDeliverGiftResponse = 2566,
    k_EMsgClientToGCUnpackBundleResponse = 2567,
    k_EMsgGCToClientStoreTransactionCompleted = 2568,
    k_EMsgClientToGCEquipItems = 2569,
    k_EMsgClientToGCEquipItemsResponse = 2570,
    k_EMsgClientToGCUnlockItemStyle = 2571,
    k_EMsgClientToGCUnlockItemStyleResponse = 2572,
    k_EMsgClientToGCSetItemInventoryCategory = 2573,
    k_EMsgClientToGCUnlockCrate = 2574,
    k_EMsgClientToGCUnlockCrateResponse = 2575,
    k_EMsgClientToGCUnpackBundle = 2576,
    k_EMsgClientToGCSetItemStyle = 2577,
    k_EMsgClientToGCSetItemStyleResponse = 2578,
    k_EMsgSQLGCToGCGrantBackpackSlots = 2580,
    k_EMsgClientToGCLookupAccountName = 2581,
    k_EMsgClientToGCLookupAccountNameResponse = 2582,
    k_EMsgClientToGCCreateStaticRecipe = 2584,
    k_EMsgClientToGCCreateStaticRecipeResponse = 2585,
    k_EMsgGCToGCStoreProcessCDKeyTransaction = 2586,
    k_EMsgGCToGCStoreProcessCDKeyTransactionResponse = 2587,
    k_EMsgGCToGCStoreProcessSettlement = 2588,
    k_EMsgGCToGCStoreProcessSettlementResponse = 2589,
    k_EMsgGCToGCConsoleOutput = 2590,
    k_EMsgGCToClientItemAges = 2591,
    k_EMsgGCToGCInternalTestMsg = 2592,
    k_EMsgGCToGCClientServerVersionsUpdated = 2593,
    k_EMsgGCUseMultipleItemsRequest = 2594,
    k_EMsgGCGetAccountSubscriptionItem = 2595,
    k_EMsgGCGetAccountSubscriptionItemResponse = 2596,
    k_EMsgGCToGCBroadcastMessageFromSub = 2598,
    k_EMsgGCToClientCurrencyPricePoints = 2599,
    k_EMsgGCToGCAddSubscriptionTime = 2600,
    k_EMsgGCToGCFlushSteamInventoryCache = 2601,
    k_EMsgGCRequestCrateEscalationLevel = 2602,
    k_EMsgGCRequestCrateEscalationLevelResponse = 2603,
    k_EMsgGCToGCUpdateSubscriptionItems = 2604,
    k_EMsgGCToGCSelfPing = 2605,
    k_EMsgGCToGCGetInfuxIntervalStats = 2606,
    k_EMsgGCToGCGetInfuxIntervalStatsResponse = 2607,
    k_EMsgGCToGCPurchaseSucceeded = 2608,
    k_EMsgClientToGCGetLimitedItemPurchaseQuantity = 2609,
    k_EMsgClientToGCGetLimitedItemPurchaseQuantityResponse = 2610,
    k_EMsgGCToGCBetaDeleteItems = 2611,
    k_EMsgClientToGCGetInFlightItemCharges = 2612,
    k_EMsgClientToGCGetInFlightItemChargesResponse = 2613,
    k_EMsgGCToClientInFlightChargesUpdated = 2614,
    k_EMsgClientToGCPurchaseChargeCostItems = 2615,
    k_EMsgClientToGCPurchaseChargeCostItemsResponse = 2616,
    k_EMsgClientToGCCancelUnfinalizedTransactions = 2617,
    k_EMsgClientToGCCancelUnfinalizedTransactionsResponse = 2618
}
export declare function eGCItemMsgFromJSON(object: any): EGCItemMsg;
export declare function eGCItemMsgToJSON(object: EGCItemMsg): string;
export declare enum EGCMsgInitiateTradeResponse {
    k_EGCMsgInitiateTradeResponse_Accepted = 0,
    k_EGCMsgInitiateTradeResponse_Declined = 1,
    k_EGCMsgInitiateTradeResponse_VAC_Banned_Initiator = 2,
    k_EGCMsgInitiateTradeResponse_VAC_Banned_Target = 3,
    k_EGCMsgInitiateTradeResponse_Target_Already_Trading = 4,
    k_EGCMsgInitiateTradeResponse_Disabled = 5,
    k_EGCMsgInitiateTradeResponse_NotLoggedIn = 6,
    k_EGCMsgInitiateTradeResponse_Cancel = 7,
    k_EGCMsgInitiateTradeResponse_TooSoon = 8,
    k_EGCMsgInitiateTradeResponse_TooSoonPenalty = 9,
    k_EGCMsgInitiateTradeResponse_Trade_Banned_Initiator = 10,
    k_EGCMsgInitiateTradeResponse_Trade_Banned_Target = 11,
    k_EGCMsgInitiateTradeResponse_Free_Account_Initiator_DEPRECATED = 12,
    k_EGCMsgInitiateTradeResponse_Shared_Account_Initiator = 13,
    k_EGCMsgInitiateTradeResponse_Service_Unavailable = 14,
    k_EGCMsgInitiateTradeResponse_Target_Blocked = 15,
    k_EGCMsgInitiateTradeResponse_NeedVerifiedEmail = 16,
    k_EGCMsgInitiateTradeResponse_NeedSteamGuard = 17,
    k_EGCMsgInitiateTradeResponse_SteamGuardDuration = 18,
    k_EGCMsgInitiateTradeResponse_TheyCannotTrade = 19,
    k_EGCMsgInitiateTradeResponse_Recent_Password_Reset = 20,
    k_EGCMsgInitiateTradeResponse_Using_New_Device = 21,
    k_EGCMsgInitiateTradeResponse_Sent_Invalid_Cookie = 22,
    k_EGCMsgInitiateTradeResponse_TooRecentFriend = 23,
    k_EGCMsgInitiateTradeResponse_WalledFundsNotTrusted = 24
}
export declare function eGCMsgInitiateTradeResponseFromJSON(object: any): EGCMsgInitiateTradeResponse;
export declare function eGCMsgInitiateTradeResponseToJSON(object: EGCMsgInitiateTradeResponse): string;
export interface CMsgApplyAutograph {
    autographItemId: string;
    itemItemId: string;
}
export interface CMsgAdjustItemEquippedState {
    itemId: string;
    newClass: number;
    newSlot: number;
    styleIndex: number;
}
export interface CMsgEconPlayerStrangeCountAdjustment {
    accountId: number;
    strangeCountAdjustments: CMsgEconPlayerStrangeCountAdjustment_CStrangeCountAdjustment[];
    turboMode: boolean;
}
export interface CMsgEconPlayerStrangeCountAdjustment_CStrangeCountAdjustment {
    eventType: number;
    itemId: string;
    adjustment: number;
}
export interface CMsgCraftingResponse {
    itemIds: string[];
}
export interface CMsgGCRequestStoreSalesData {
    version: number;
    currency: number;
}
export interface CMsgGCRequestStoreSalesDataResponse {
    salePrice: CMsgGCRequestStoreSalesDataResponse_Price[];
    version: number;
    expirationTime: number;
}
export interface CMsgGCRequestStoreSalesDataResponse_Price {
    itemDef: number;
    price: number;
}
export interface CMsgGCRequestStoreSalesDataUpToDateResponse {
    version: number;
    expirationTime: number;
}
export interface CMsgGCToGCPingRequest {
}
export interface CMsgGCToGCPingResponse {
}
export interface CMsgGCToGCGetUserSessionServer {
    accountId: number;
}
export interface CMsgGCToGCGetUserSessionServerResponse {
    serverSteamId: string;
    isOnline: boolean;
}
export interface CMsgGCToGCGetUserServerMembers {
    accountId: number;
    maxSpectators: number;
}
export interface CMsgGCToGCGetUserServerMembersResponse {
    memberAccountId: number[];
}
export interface CMsgLookupMultipleAccountNames {
    accountids: number[];
}
export interface CMsgLookupMultipleAccountNamesResponse {
    accounts: CMsgLookupMultipleAccountNamesResponse_Account[];
}
export interface CMsgLookupMultipleAccountNamesResponse_Account {
    accountid: number;
    persona: string;
}
export interface CMsgRequestCrateItems {
    crateItemDef: number;
}
export interface CMsgRequestCrateItemsResponse {
    response: number;
    itemDefs: number[];
    peekItemDefs: number[];
    peekItems: CSOEconItem[];
}
export declare enum CMsgRequestCrateItemsResponse_EResult {
    k_Succeeded = 0,
    k_Failed = 1
}
export declare function cMsgRequestCrateItemsResponse_EResultFromJSON(object: any): CMsgRequestCrateItemsResponse_EResult;
export declare function cMsgRequestCrateItemsResponse_EResultToJSON(object: CMsgRequestCrateItemsResponse_EResult): string;
export interface CMsgRequestCrateEscalationLevel {
    crateItemDef: number;
}
export interface CMsgRequestCrateEscalationLevelResponse {
    response: number;
    escalationLevel0: number;
    escalationLevel1: number;
    escalationLevel2: number;
    escalationLevel3: number;
}
export declare enum CMsgRequestCrateEscalationLevelResponse_EResult {
    k_Succeeded = 0,
    k_Failed = 1
}
export declare function cMsgRequestCrateEscalationLevelResponse_EResultFromJSON(object: any): CMsgRequestCrateEscalationLevelResponse_EResult;
export declare function cMsgRequestCrateEscalationLevelResponse_EResultToJSON(object: CMsgRequestCrateEscalationLevelResponse_EResult): string;
export interface CMsgGCToGCCanUseDropRateBonus {
    accountId: number;
    dropRateBonus: number;
    boosterType: number;
    exclusiveItemDef: number;
    allowEqualRate: boolean;
}
export interface CMsgSQLAddDropRateBonus {
    accountId: number;
    itemId: string;
    itemDef: number;
    dropRateBonus: number;
    boosterType: number;
    secondsDuration: number;
    endTimeStamp: number;
}
export interface CMsgSQLUpgradeBattleBooster {
    accountId: number;
    itemDef: number;
    bonusToAdd: number;
    boosterType: number;
}
export interface CMsgGCToGCRefreshSOCache {
    accountId: number;
    reload: boolean;
}
export interface CMsgGCToGCAddSubscriptionTime {
    accountId: number;
    matchingSubscriptionDefIndexes: number[];
    additionalSeconds: number;
}
export interface CMsgGCToGCGrantAccountRolledItems {
    accountId: number;
    items: CMsgGCToGCGrantAccountRolledItems_Item[];
    auditAction: number;
    auditData: string;
}
export interface CMsgGCToGCGrantAccountRolledItems_Item {
    itemDef: number;
    lootLists: string[];
    ignoreLimit: boolean;
    origin: number;
    dynamicAttributes: CMsgGCToGCGrantAccountRolledItems_Item_DynamicAttribute[];
    additionalAuditEntries: CMsgGCToGCGrantAccountRolledItems_Item_AdditionalAuditEntry[];
    inventoryToken: number;
    quality: number;
}
export interface CMsgGCToGCGrantAccountRolledItems_Item_DynamicAttribute {
    name: string;
    valueUint32: number;
    valueFloat: number;
    valueString: string;
}
export interface CMsgGCToGCGrantAccountRolledItems_Item_AdditionalAuditEntry {
    ownerAccountId: number;
    auditAction: number;
    auditData: string;
}
export interface CMsgGCToGCBetaDeleteItems {
    accountId: number;
    itemIds: string[];
    itemDefs: number[];
}
export interface CMsgGCToGCGrantSelfMadeItemToAccount {
    itemDefIndex: number;
    accountid: number;
}
export interface CMsgUseItem {
    itemId: string;
    targetSteamId: string;
    giftPotentialTargets: number[];
    duelClassLock: number;
    initiatorSteamId: string;
    itempackAckImmediately: boolean;
}
export interface CMsgServerUseItem {
    initiatorAccountId: number;
    useItemMsg: CMsgUseItem | undefined;
}
export interface CMsgUseMultipleItems {
    itemIds: string[];
}
export interface CGCStoreRechargeRedirectLineItem {
    itemDefId: number;
    quantity: number;
}
export interface CMsgGCEconSQLWorkItemEmbeddedRollbackData {
    accountId: number;
    deletedItemId: string;
    oldAuditAction: number;
    newAuditAction: number;
    expectedAuditAction: number;
}
export interface CMsgCraftStatue {
    heroid: number;
    sequencename: string;
    cycle: number;
    description: string;
    pedestalItemdef: number;
    toolid: string;
}
export interface CMsgRedeemCode {
    code: string;
}
export interface CMsgRedeemCodeResponse {
    response: number;
    itemId: string;
}
export declare enum CMsgRedeemCodeResponse_EResultCode {
    k_Succeeded = 0,
    k_Failed_CodeNotFound = 1,
    k_Failed_CodeAlreadyUsed = 2,
    k_Failed_OtherError = 3
}
export declare function cMsgRedeemCodeResponse_EResultCodeFromJSON(object: any): CMsgRedeemCodeResponse_EResultCode;
export declare function cMsgRedeemCodeResponse_EResultCodeToJSON(object: CMsgRedeemCodeResponse_EResultCode): string;
export interface CMsgDevNewItemRequest {
    itemDefName: string;
    lootListName: string;
    attrDefName: string[];
    attrValue: string[];
    itemQuality: number;
}
export interface CMsgDevNewItemRequestResponse {
    success: boolean;
}
export interface CMsgDevUnlockAllItemStyles {
    itemId: string;
}
export interface CMsgDevUnlockAllItemStylesResponse {
    success: boolean;
}
export interface CMsgGCGetAccountSubscriptionItem {
    accountId: number;
}
export interface CMsgGCGetAccountSubscriptionItemResponse {
    defIndex: number;
}
export interface CMsgGCAddGiftItem {
    gifterAccountId: number;
    receiverAccountId: number;
    wrappedItem: CSOEconItem | undefined;
    giftMessage: string;
    isWalletCashTrusted: boolean;
}
export interface CMsgClientToGCWrapAndDeliverGift {
    itemId: string;
    giveToAccountId: number;
    giftMessage: string;
}
export interface CMsgSQLGCToGCRevokeUntrustedGift {
    accountId: number;
    sentItemId: string;
}
export interface CMsgClientToGCWrapAndDeliverGiftResponse {
    response: EGCMsgResponse;
    giftingChargeUses: number;
    giftingChargeMax: number;
    giftingUses: number;
    giftingMax: number;
    giftingWindowHours: number;
    tradeRestriction: EGCMsgInitiateTradeResponse;
}
export interface CMsgClientToGCUnwrapGift {
    itemId: string;
}
export interface CMsgClientToGCGetGiftPermissions {
}
export interface CMsgClientToGCGetGiftPermissionsResponse {
    isUnlimited: boolean;
    hasTwoFactor: boolean;
    senderPermission: EGCMsgInitiateTradeResponse;
    friendshipAgeRequirement: number;
    friendshipAgeRequirementTwoFactor: number;
    friendPermissions: CMsgClientToGCGetGiftPermissionsResponse_FriendPermission[];
}
export interface CMsgClientToGCGetGiftPermissionsResponse_FriendPermission {
    accountId: number;
    permission: EGCMsgInitiateTradeResponse;
}
export interface CMsgClientToGCUnpackBundle {
    itemId: string;
}
export interface CMsgClientToGCUnpackBundleResponse {
    unpackedItemIds: string[];
    response: CMsgClientToGCUnpackBundleResponse_EUnpackBundle;
    unpackedItemDefIndexes: number[];
}
export declare enum CMsgClientToGCUnpackBundleResponse_EUnpackBundle {
    k_UnpackBundle_Succeeded = 0,
    k_UnpackBundle_Failed_ItemIsNotBundle = 1,
    k_UnpackBundle_Failed_UnableToCreateContainedItem = 2,
    k_UnpackBundle_Failed_SOCacheError = 3,
    k_UnpackBundle_Failed_ItemIsInvalid = 4,
    k_UnpackBundle_Failed_BadItemQuantity = 5,
    k_UnpackBundle_Failed_UnableToDeleteItem = 6
}
export declare function cMsgClientToGCUnpackBundleResponse_EUnpackBundleFromJSON(object: any): CMsgClientToGCUnpackBundleResponse_EUnpackBundle;
export declare function cMsgClientToGCUnpackBundleResponse_EUnpackBundleToJSON(object: CMsgClientToGCUnpackBundleResponse_EUnpackBundle): string;
export interface CMsgClientToGCPackBundle {
    itemIds: string[];
    bundleItemDefIndex: number;
}
export interface CMsgClientToGCPackBundleResponse {
    itemId: string;
    response: CMsgClientToGCPackBundleResponse_EPackBundle;
}
export declare enum CMsgClientToGCPackBundleResponse_EPackBundle {
    k_PackBundle_Succeeded = 0,
    k_PackBundle_Failed_InternalError = 1,
    k_PackBundle_Failed_ItemIsNotBundle = 2,
    k_PackBundle_Failed_SOCacheError = 3,
    k_PackBundle_Failed_ItemIsInvalid = 4,
    k_PackBundle_Failed_BadItemQuantity = 5,
    k_PackBundle_Failed_UnableToDeleteItem = 6,
    k_PackBundle_Failed_BundleCannotBePacked = 7,
    k_PackBundle_Failed_ItemIsUntradeable = 8,
    k_PackBundle_Failed_ItemIsEquipped = 9,
    k_PackBundle_Failed_ItemHasGems = 10,
    k_PackBundle_Failed_ItemMixedQuality = 11,
    k_PackBundle_Failed_ItemInvalidQuality = 12,
    k_PackBundle_Failed_ItemIsNonEconomy = 13,
    k_PackBundle_Failed_Disabled = 14
}
export declare function cMsgClientToGCPackBundleResponse_EPackBundleFromJSON(object: any): CMsgClientToGCPackBundleResponse_EPackBundle;
export declare function cMsgClientToGCPackBundleResponse_EPackBundleToJSON(object: CMsgClientToGCPackBundleResponse_EPackBundle): string;
export interface CMsgGCToClientStoreTransactionCompleted {
    txnId: string;
    itemIds: string[];
}
export interface CMsgClientToGCEquipItems {
    equips: CMsgAdjustItemEquippedState[];
}
export interface CMsgClientToGCEquipItemsResponse {
    soCacheVersionId: string;
}
export interface CMsgClientToGCSetItemStyle {
    itemId: string;
    styleIndex: number;
}
export interface CMsgClientToGCSetItemStyleResponse {
    response: CMsgClientToGCSetItemStyleResponse_ESetStyle;
}
export declare enum CMsgClientToGCSetItemStyleResponse_ESetStyle {
    k_SetStyle_Succeeded = 0,
    k_SetStyle_Failed = 1,
    k_SetStyle_Failed_StyleIsLocked = 2
}
export declare function cMsgClientToGCSetItemStyleResponse_ESetStyleFromJSON(object: any): CMsgClientToGCSetItemStyleResponse_ESetStyle;
export declare function cMsgClientToGCSetItemStyleResponse_ESetStyleToJSON(object: CMsgClientToGCSetItemStyleResponse_ESetStyle): string;
export interface CMsgClientToGCUnlockItemStyle {
    itemToUnlock: string;
    styleIndex: number;
    consumableItemIds: string[];
}
export interface CMsgClientToGCUnlockItemStyleResponse {
    response: CMsgClientToGCUnlockItemStyleResponse_EUnlockStyle;
    itemId: string;
    styleIndex: number;
    stylePrereq: number;
}
export declare enum CMsgClientToGCUnlockItemStyleResponse_EUnlockStyle {
    k_UnlockStyle_Succeeded = 0,
    k_UnlockStyle_Failed_PreReq = 1,
    k_UnlockStyle_Failed_CantAfford = 2,
    k_UnlockStyle_Failed_CantCommit = 3,
    k_UnlockStyle_Failed_CantLockCache = 4,
    k_UnlockStyle_Failed_CantAffordAttrib = 5,
    k_UnlockStyle_Failed_CantAffordGem = 6,
    k_UnlockStyle_Failed_NoCompendiumLevel = 7,
    k_UnlockStyle_Failed_AlreadyUnlocked = 8,
    k_UnlockStyle_Failed_OtherError = 9,
    k_UnlockStyle_Failed_ItemIsInvalid = 10,
    k_UnlockStyle_Failed_ToolIsInvalid = 11
}
export declare function cMsgClientToGCUnlockItemStyleResponse_EUnlockStyleFromJSON(object: any): CMsgClientToGCUnlockItemStyleResponse_EUnlockStyle;
export declare function cMsgClientToGCUnlockItemStyleResponse_EUnlockStyleToJSON(object: CMsgClientToGCUnlockItemStyleResponse_EUnlockStyle): string;
export interface CMsgClientToGCSetItemInventoryCategory {
    itemIds: string[];
    setToValue: number;
    removeCategories: number;
    addCategories: number;
}
export interface CMsgClientToGCUnlockCrate {
    crateItemId: string;
    keyItemId: string;
}
export interface CMsgClientToGCUnlockCrateResponse {
    result: EGCMsgResponse;
    grantedItems: CMsgClientToGCUnlockCrateResponse_Item[];
}
export interface CMsgClientToGCUnlockCrateResponse_Item {
    itemId: string;
    defIndex: number;
}
export interface CMsgClientToGCRemoveItemAttribute {
    itemId: string;
}
export interface CMsgClientToGCRemoveItemAttributeResponse {
    response: CMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttribute;
    itemId: string;
}
export declare enum CMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttribute {
    k_RemoveItemAttribute_Succeeded = 0,
    k_RemoveItemAttribute_Failed = 1,
    k_RemoveItemAttribute_Failed_ItemIsInvalid = 2,
    k_RemoveItemAttribute_Failed_AttributeCannotBeRemoved = 3,
    k_RemoveItemAttribute_Failed_AttributeDoesntExist = 4
}
export declare function cMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttributeFromJSON(object: any): CMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttribute;
export declare function cMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttributeToJSON(object: CMsgClientToGCRemoveItemAttributeResponse_ERemoveItemAttribute): string;
export interface CMsgClientToGCNameItem {
    subjectItemId: string;
    toolItemId: string;
    name: string;
}
export interface CMsgClientToGCNameItemResponse {
    response: CMsgClientToGCNameItemResponse_ENameItem;
    itemId: string;
}
export declare enum CMsgClientToGCNameItemResponse_ENameItem {
    k_NameItem_Succeeded = 0,
    k_NameItem_Failed = 1,
    k_NameItem_Failed_ToolIsInvalid = 2,
    k_NameItem_Failed_ItemIsInvalid = 3,
    k_NameItem_Failed_NameIsInvalid = 4
}
export declare function cMsgClientToGCNameItemResponse_ENameItemFromJSON(object: any): CMsgClientToGCNameItemResponse_ENameItem;
export declare function cMsgClientToGCNameItemResponse_ENameItemToJSON(object: CMsgClientToGCNameItemResponse_ENameItem): string;
export interface CMsgGCSetItemPosition {
    itemId: string;
    newPosition: number;
}
export interface CAttributeItemDynamicRecipeComponent {
    itemDef: number;
    itemQuality: number;
    itemFlags: number;
    attributesString: string;
    itemCount: number;
    itemsFulfilled: number;
    itemRarity: number;
    lootlist: string;
    fulfilledItemId: string;
    associatedItemDef: number;
}
export interface CProtoItemSocket {
    itemId: string;
    attrDefIndex: number;
    requiredType: number;
    requiredHero: string;
    gemDefIndex: number;
    notTradable: boolean;
    requiredItemSlot: string;
}
export interface CProtoItemSocketEmpty {
    socket: CProtoItemSocket | undefined;
}
export interface CProtoItemSocketEffect {
    socket: CProtoItemSocket | undefined;
    effect: number;
}
export interface CProtoItemSocketColor {
    socket: CProtoItemSocket | undefined;
    red: number;
    green: number;
    blue: number;
}
export interface CProtoItemSocketStrange {
    socket: CProtoItemSocket | undefined;
    strangeType: number;
    strangeValue: number;
}
export interface CProtoItemSocketStrangeDESERIALIZEFROMSTRINGONLY {
    socket: CProtoItemSocket | undefined;
    strangeType: number;
    strangeValue: number;
    abilityEffect: number;
}
export interface CProtoItemSocketSpectator {
    socket: CProtoItemSocket | undefined;
    gamesViewed: number;
    corporationId: number;
    leagueId: number;
    teamId: number;
}
export interface CProtoItemSocketAssetModifier {
    socket: CProtoItemSocket | undefined;
    assetModifier: number;
}
export interface CProtoItemSocketAssetModifierDESERIALIZEFROMSTRINGONLY {
    socket: CProtoItemSocket | undefined;
    assetModifier: number;
    animModifier: number;
    abilityEffect: number;
}
export interface CProtoItemSocketAutograph {
    socket: CProtoItemSocket | undefined;
    autograph: string;
    autographId: number;
    autographScore: number;
}
export interface CProtoItemSocketStaticVisuals {
    socket: CProtoItemSocket | undefined;
}
export interface CAttributeString {
    value: string;
}
export interface CWorkshopGetItemDailyRevenueRequest {
    appid: number;
    itemId: number;
    dateStart: number;
    dateEnd: number;
}
export interface CWorkshopGetItemDailyRevenueResponse {
    countryRevenue: CWorkshopGetItemDailyRevenueResponse_CountryDailyRevenue[];
}
export interface CWorkshopGetItemDailyRevenueResponse_CountryDailyRevenue {
    countryCode: string;
    date: number;
    revenueUsd: string;
    units: number;
}
export interface CWorkshopGetPackageDailyRevenueRequest {
    packageid: number;
    dateStart: number;
    dateEnd: number;
}
export interface CWorkshopGetPackageDailyRevenueResponse {
    countryRevenue: CWorkshopGetPackageDailyRevenueResponse_CountryDailyRevenue[];
}
export interface CWorkshopGetPackageDailyRevenueResponse_CountryDailyRevenue {
    countryCode: string;
    date: number;
    revenueUsd: string;
    units: number;
}
export interface CMsgSQLGCToGCGrantBackpackSlots {
    accountId: number;
    addSlots: number;
}
export interface CMsgClientToGCLookupAccountName {
    accountId: number;
}
export interface CMsgClientToGCLookupAccountNameResponse {
    accountId: number;
    accountName: string;
}
export interface CMsgClientToGCCreateStaticRecipe {
    items: CMsgClientToGCCreateStaticRecipe_Item[];
    recipeDefIndex: number;
}
export interface CMsgClientToGCCreateStaticRecipe_Item {
    itemId: string;
    slotId: number;
}
export interface CMsgClientToGCCreateStaticRecipeResponse {
    response: CMsgClientToGCCreateStaticRecipeResponse_EResponse;
    outputItems: CMsgClientToGCCreateStaticRecipeResponse_OutputItem[];
    inputErrors: CMsgClientToGCCreateStaticRecipeResponse_InputError[];
    additionalOutputs: CMsgClientToGCCreateStaticRecipeResponse_AdditionalOutput[];
}
export declare enum CMsgClientToGCCreateStaticRecipeResponse_EResponse {
    eResponse_Success = 0,
    eResponse_OfferingDisabled = 1,
    eResponse_InvalidItems = 2,
    eResponse_InternalError = 3,
    eResponse_MissingLeague = 4,
    eResponse_MissingEvent = 5
}
export declare function cMsgClientToGCCreateStaticRecipeResponse_EResponseFromJSON(object: any): CMsgClientToGCCreateStaticRecipeResponse_EResponse;
export declare function cMsgClientToGCCreateStaticRecipeResponse_EResponseToJSON(object: CMsgClientToGCCreateStaticRecipeResponse_EResponse): string;
export interface CMsgClientToGCCreateStaticRecipeResponse_OutputItem {
    defIndex: number;
    itemId: string;
    slotId: number;
}
export interface CMsgClientToGCCreateStaticRecipeResponse_InputError {
    slotId: number;
    error: CMsgClientToGCCreateStaticRecipeResponse_EResponse;
}
export interface CMsgClientToGCCreateStaticRecipeResponse_AdditionalOutput {
    slotId: number;
    value: string;
}
export interface CMsgProcessTransactionOrder {
    txnId: string;
    steamTxnId: string;
    partnerTxnId: string;
    steamId: string;
    timeStamp: number;
    watermark: string;
    purchaseReportStatus: number;
    currency: number;
    items: CMsgProcessTransactionOrder_Item[];
}
export interface CMsgProcessTransactionOrder_Item {
    itemDefIndex: number;
    itemPrice: number;
    quantity: number;
    categoryDesc: string;
    storePurchaseType: number;
    sourceReferenceId: string;
    parentStackIndex: number;
    defaultPrice: boolean;
    isUserFacing: boolean;
    priceIndex: number;
}
export interface CMsgGCToGCStoreProcessCDKeyTransaction {
    order: CMsgProcessTransactionOrder | undefined;
    reasonCode: number;
    partner: number;
}
export interface CMsgGCToGCStoreProcessCDKeyTransactionResponse {
    success: boolean;
}
export interface CMsgGCToGCStoreProcessSettlement {
    order: CMsgProcessTransactionOrder | undefined;
}
export interface CMsgGCToGCStoreProcessSettlementResponse {
    success: boolean;
}
export interface CMsgGCToGCBroadcastConsoleCommand {
    conCommand: string;
    reportOutput: boolean;
    sendingGc: number;
    outputInitiator: string;
    senderSource: string;
}
export interface CMsgGCToGCConsoleOutput {
    initiator: string;
    sendingGc: number;
    msgs: CMsgGCToGCConsoleOutput_OutputLine[];
    isLastForSourceJob: boolean;
}
export interface CMsgGCToGCConsoleOutput_OutputLine {
    text: string;
    spewLevel: number;
}
export interface CMsgItemAges {
    maxItemIdTimestamps: CMsgItemAges_MaxItemIDTimestamp[];
}
export interface CMsgItemAges_MaxItemIDTimestamp {
    timestamp: number;
    maxItemId: string;
}
export interface CMsgGCToGCInternalTestMsg {
    sendingGc: number;
    senderId: string;
    context: number;
    messageId: number;
    messageBody: Buffer;
    jobIdSource: string;
    jobIdTarget: string;
}
export interface CMsgGCToGCClientServerVersionsUpdated {
    clientMinAllowedVersion: number;
    clientActiveVersion: number;
    serverActiveVersion: number;
    serverDeployedVersion: number;
    whatChanged: number;
}
export interface CMsgGCToGCBroadcastMessageFromSub {
    msgId: number;
    serializedMsg: Buffer;
    accountIdList: number[];
    steamIdList: string[];
}
export interface CMsgGCToClientCurrencyPricePoints {
    priceKey: string[];
    currencies: CMsgGCToClientCurrencyPricePoints_Currency[];
}
export interface CMsgGCToClientCurrencyPricePoints_Currency {
    currencyId: number;
    currencyPrice: string[];
}
export interface CMsgBannedWordList {
    version: number;
    bannedWords: string[];
}
export interface CMsgGCToGCFlushSteamInventoryCache {
    keys: CMsgGCToGCFlushSteamInventoryCache_Key[];
}
export interface CMsgGCToGCFlushSteamInventoryCache_Key {
    steamid: string;
    contextid: string;
}
export interface CMsgGCToGCUpdateSubscriptionItems {
    accountId: number;
    alwaysNotify: boolean;
}
export interface CMsgGCToGCSelfPing {
    sampleId: number;
}
export interface CMsgGCToGCGetInfuxIntervalStats {
}
export interface CMsgGCToGCGetInfuxIntervalStatsResponse {
    statIds: number[];
    statTotal: string[];
    statSamples: number[];
    statMax: number[];
    sampleDurationMs: number;
}
export interface CMsgGCToGCPurchaseSucceeded {
}
export interface CMsgClientToGCGetLimitedItemPurchaseQuantity {
    itemDef: number;
}
export interface CMsgClientToGCGetLimitedItemPurchaseQuantityResponse {
    result: CMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponse;
    quantityPurchased: number;
}
export declare enum CMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidItemDef = 5,
    k_eItemDefNotLimited = 6
}
export declare function cMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponseFromJSON(object: any): CMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponse;
export declare function cMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponseToJSON(object: CMsgClientToGCGetLimitedItemPurchaseQuantityResponse_EResponse): string;
export interface CMsgClientToGCGetInFlightItemCharges {
    itemDef: number;
}
export interface CMsgClientToGCGetInFlightItemChargesResponse {
    result: CMsgClientToGCGetInFlightItemChargesResponse_EResponse;
    chargesInFlight: number;
}
export declare enum CMsgClientToGCGetInFlightItemChargesResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidItemDef = 5
}
export declare function cMsgClientToGCGetInFlightItemChargesResponse_EResponseFromJSON(object: any): CMsgClientToGCGetInFlightItemChargesResponse_EResponse;
export declare function cMsgClientToGCGetInFlightItemChargesResponse_EResponseToJSON(object: CMsgClientToGCGetInFlightItemChargesResponse_EResponse): string;
export interface CMsgClientToGCPurchaseChargeCostItems {
    items: CMsgClientToGCPurchaseChargeCostItems_Item[];
    currency: number;
}
export interface CMsgClientToGCPurchaseChargeCostItems_Item {
    itemDefIndex: number;
    quantity: number;
    sourceReferenceId: string;
    priceIndex: number;
}
export interface CMsgClientToGCPurchaseChargeCostItemsResponse {
    result: CMsgClientToGCPurchaseChargeCostItemsResponse_EResponse;
    itemIds: string[];
}
export declare enum CMsgClientToGCPurchaseChargeCostItemsResponse_EResponse {
    k_eInternalError = 0,
    k_eSuccess = 1,
    k_eTooBusy = 2,
    k_eDisabled = 3,
    k_eTimeout = 4,
    k_eInvalidParam = 5,
    k_eInvalidPrice = 6,
    k_eInsufficientCharges = 7,
    k_eLimitedItem = 8,
    k_eMissingPrereq = 10
}
export declare function cMsgClientToGCPurchaseChargeCostItemsResponse_EResponseFromJSON(object: any): CMsgClientToGCPurchaseChargeCostItemsResponse_EResponse;
export declare function cMsgClientToGCPurchaseChargeCostItemsResponse_EResponseToJSON(object: CMsgClientToGCPurchaseChargeCostItemsResponse_EResponse): string;
export interface CMsgGCToClientInFlightChargesUpdated {
    inFlightCharges: CMsgGCToClientInFlightChargesUpdated_ItemCharges[];
}
export interface CMsgGCToClientInFlightChargesUpdated_ItemCharges {
    itemDef: number;
    chargesInFlight: number;
}
export interface CMsgClientToGCCancelUnfinalizedTransactions {
    unused: number;
}
export interface CMsgClientToGCCancelUnfinalizedTransactionsResponse {
    result: number;
}
export interface CMsgGCToGCUpdateWelcomeMsg {
    server: boolean;
    newMsg: CExtraMsgBlock | undefined;
    broadcast: boolean;
}
export declare const CMsgApplyAutograph: MessageFns<CMsgApplyAutograph>;
export declare const CMsgAdjustItemEquippedState: MessageFns<CMsgAdjustItemEquippedState>;
export declare const CMsgEconPlayerStrangeCountAdjustment: MessageFns<CMsgEconPlayerStrangeCountAdjustment>;
export declare const CMsgEconPlayerStrangeCountAdjustment_CStrangeCountAdjustment: MessageFns<CMsgEconPlayerStrangeCountAdjustment_CStrangeCountAdjustment>;
export declare const CMsgCraftingResponse: MessageFns<CMsgCraftingResponse>;
export declare const CMsgGCRequestStoreSalesData: MessageFns<CMsgGCRequestStoreSalesData>;
export declare const CMsgGCRequestStoreSalesDataResponse: MessageFns<CMsgGCRequestStoreSalesDataResponse>;
export declare const CMsgGCRequestStoreSalesDataResponse_Price: MessageFns<CMsgGCRequestStoreSalesDataResponse_Price>;
export declare const CMsgGCRequestStoreSalesDataUpToDateResponse: MessageFns<CMsgGCRequestStoreSalesDataUpToDateResponse>;
export declare const CMsgGCToGCPingRequest: MessageFns<CMsgGCToGCPingRequest>;
export declare const CMsgGCToGCPingResponse: MessageFns<CMsgGCToGCPingResponse>;
export declare const CMsgGCToGCGetUserSessionServer: MessageFns<CMsgGCToGCGetUserSessionServer>;
export declare const CMsgGCToGCGetUserSessionServerResponse: MessageFns<CMsgGCToGCGetUserSessionServerResponse>;
export declare const CMsgGCToGCGetUserServerMembers: MessageFns<CMsgGCToGCGetUserServerMembers>;
export declare const CMsgGCToGCGetUserServerMembersResponse: MessageFns<CMsgGCToGCGetUserServerMembersResponse>;
export declare const CMsgLookupMultipleAccountNames: MessageFns<CMsgLookupMultipleAccountNames>;
export declare const CMsgLookupMultipleAccountNamesResponse: MessageFns<CMsgLookupMultipleAccountNamesResponse>;
export declare const CMsgLookupMultipleAccountNamesResponse_Account: MessageFns<CMsgLookupMultipleAccountNamesResponse_Account>;
export declare const CMsgRequestCrateItems: MessageFns<CMsgRequestCrateItems>;
export declare const CMsgRequestCrateItemsResponse: MessageFns<CMsgRequestCrateItemsResponse>;
export declare const CMsgRequestCrateEscalationLevel: MessageFns<CMsgRequestCrateEscalationLevel>;
export declare const CMsgRequestCrateEscalationLevelResponse: MessageFns<CMsgRequestCrateEscalationLevelResponse>;
export declare const CMsgGCToGCCanUseDropRateBonus: MessageFns<CMsgGCToGCCanUseDropRateBonus>;
export declare const CMsgSQLAddDropRateBonus: MessageFns<CMsgSQLAddDropRateBonus>;
export declare const CMsgSQLUpgradeBattleBooster: MessageFns<CMsgSQLUpgradeBattleBooster>;
export declare const CMsgGCToGCRefreshSOCache: MessageFns<CMsgGCToGCRefreshSOCache>;
export declare const CMsgGCToGCAddSubscriptionTime: MessageFns<CMsgGCToGCAddSubscriptionTime>;
export declare const CMsgGCToGCGrantAccountRolledItems: MessageFns<CMsgGCToGCGrantAccountRolledItems>;
export declare const CMsgGCToGCGrantAccountRolledItems_Item: MessageFns<CMsgGCToGCGrantAccountRolledItems_Item>;
export declare const CMsgGCToGCGrantAccountRolledItems_Item_DynamicAttribute: MessageFns<CMsgGCToGCGrantAccountRolledItems_Item_DynamicAttribute>;
export declare const CMsgGCToGCGrantAccountRolledItems_Item_AdditionalAuditEntry: MessageFns<CMsgGCToGCGrantAccountRolledItems_Item_AdditionalAuditEntry>;
export declare const CMsgGCToGCBetaDeleteItems: MessageFns<CMsgGCToGCBetaDeleteItems>;
export declare const CMsgGCToGCGrantSelfMadeItemToAccount: MessageFns<CMsgGCToGCGrantSelfMadeItemToAccount>;
export declare const CMsgUseItem: MessageFns<CMsgUseItem>;
export declare const CMsgServerUseItem: MessageFns<CMsgServerUseItem>;
export declare const CMsgUseMultipleItems: MessageFns<CMsgUseMultipleItems>;
export declare const CGCStoreRechargeRedirectLineItem: MessageFns<CGCStoreRechargeRedirectLineItem>;
export declare const CMsgGCEconSQLWorkItemEmbeddedRollbackData: MessageFns<CMsgGCEconSQLWorkItemEmbeddedRollbackData>;
export declare const CMsgCraftStatue: MessageFns<CMsgCraftStatue>;
export declare const CMsgRedeemCode: MessageFns<CMsgRedeemCode>;
export declare const CMsgRedeemCodeResponse: MessageFns<CMsgRedeemCodeResponse>;
export declare const CMsgDevNewItemRequest: MessageFns<CMsgDevNewItemRequest>;
export declare const CMsgDevNewItemRequestResponse: MessageFns<CMsgDevNewItemRequestResponse>;
export declare const CMsgDevUnlockAllItemStyles: MessageFns<CMsgDevUnlockAllItemStyles>;
export declare const CMsgDevUnlockAllItemStylesResponse: MessageFns<CMsgDevUnlockAllItemStylesResponse>;
export declare const CMsgGCGetAccountSubscriptionItem: MessageFns<CMsgGCGetAccountSubscriptionItem>;
export declare const CMsgGCGetAccountSubscriptionItemResponse: MessageFns<CMsgGCGetAccountSubscriptionItemResponse>;
export declare const CMsgGCAddGiftItem: MessageFns<CMsgGCAddGiftItem>;
export declare const CMsgClientToGCWrapAndDeliverGift: MessageFns<CMsgClientToGCWrapAndDeliverGift>;
export declare const CMsgSQLGCToGCRevokeUntrustedGift: MessageFns<CMsgSQLGCToGCRevokeUntrustedGift>;
export declare const CMsgClientToGCWrapAndDeliverGiftResponse: MessageFns<CMsgClientToGCWrapAndDeliverGiftResponse>;
export declare const CMsgClientToGCUnwrapGift: MessageFns<CMsgClientToGCUnwrapGift>;
export declare const CMsgClientToGCGetGiftPermissions: MessageFns<CMsgClientToGCGetGiftPermissions>;
export declare const CMsgClientToGCGetGiftPermissionsResponse: MessageFns<CMsgClientToGCGetGiftPermissionsResponse>;
export declare const CMsgClientToGCGetGiftPermissionsResponse_FriendPermission: MessageFns<CMsgClientToGCGetGiftPermissionsResponse_FriendPermission>;
export declare const CMsgClientToGCUnpackBundle: MessageFns<CMsgClientToGCUnpackBundle>;
export declare const CMsgClientToGCUnpackBundleResponse: MessageFns<CMsgClientToGCUnpackBundleResponse>;
export declare const CMsgClientToGCPackBundle: MessageFns<CMsgClientToGCPackBundle>;
export declare const CMsgClientToGCPackBundleResponse: MessageFns<CMsgClientToGCPackBundleResponse>;
export declare const CMsgGCToClientStoreTransactionCompleted: MessageFns<CMsgGCToClientStoreTransactionCompleted>;
export declare const CMsgClientToGCEquipItems: MessageFns<CMsgClientToGCEquipItems>;
export declare const CMsgClientToGCEquipItemsResponse: MessageFns<CMsgClientToGCEquipItemsResponse>;
export declare const CMsgClientToGCSetItemStyle: MessageFns<CMsgClientToGCSetItemStyle>;
export declare const CMsgClientToGCSetItemStyleResponse: MessageFns<CMsgClientToGCSetItemStyleResponse>;
export declare const CMsgClientToGCUnlockItemStyle: MessageFns<CMsgClientToGCUnlockItemStyle>;
export declare const CMsgClientToGCUnlockItemStyleResponse: MessageFns<CMsgClientToGCUnlockItemStyleResponse>;
export declare const CMsgClientToGCSetItemInventoryCategory: MessageFns<CMsgClientToGCSetItemInventoryCategory>;
export declare const CMsgClientToGCUnlockCrate: MessageFns<CMsgClientToGCUnlockCrate>;
export declare const CMsgClientToGCUnlockCrateResponse: MessageFns<CMsgClientToGCUnlockCrateResponse>;
export declare const CMsgClientToGCUnlockCrateResponse_Item: MessageFns<CMsgClientToGCUnlockCrateResponse_Item>;
export declare const CMsgClientToGCRemoveItemAttribute: MessageFns<CMsgClientToGCRemoveItemAttribute>;
export declare const CMsgClientToGCRemoveItemAttributeResponse: MessageFns<CMsgClientToGCRemoveItemAttributeResponse>;
export declare const CMsgClientToGCNameItem: MessageFns<CMsgClientToGCNameItem>;
export declare const CMsgClientToGCNameItemResponse: MessageFns<CMsgClientToGCNameItemResponse>;
export declare const CMsgGCSetItemPosition: MessageFns<CMsgGCSetItemPosition>;
export declare const CAttributeItemDynamicRecipeComponent: MessageFns<CAttributeItemDynamicRecipeComponent>;
export declare const CProtoItemSocket: MessageFns<CProtoItemSocket>;
export declare const CProtoItemSocketEmpty: MessageFns<CProtoItemSocketEmpty>;
export declare const CProtoItemSocketEffect: MessageFns<CProtoItemSocketEffect>;
export declare const CProtoItemSocketColor: MessageFns<CProtoItemSocketColor>;
export declare const CProtoItemSocketStrange: MessageFns<CProtoItemSocketStrange>;
export declare const CProtoItemSocketStrangeDESERIALIZEFROMSTRINGONLY: MessageFns<CProtoItemSocketStrangeDESERIALIZEFROMSTRINGONLY>;
export declare const CProtoItemSocketSpectator: MessageFns<CProtoItemSocketSpectator>;
export declare const CProtoItemSocketAssetModifier: MessageFns<CProtoItemSocketAssetModifier>;
export declare const CProtoItemSocketAssetModifierDESERIALIZEFROMSTRINGONLY: MessageFns<CProtoItemSocketAssetModifierDESERIALIZEFROMSTRINGONLY>;
export declare const CProtoItemSocketAutograph: MessageFns<CProtoItemSocketAutograph>;
export declare const CProtoItemSocketStaticVisuals: MessageFns<CProtoItemSocketStaticVisuals>;
export declare const CAttributeString: MessageFns<CAttributeString>;
export declare const CWorkshopGetItemDailyRevenueRequest: MessageFns<CWorkshopGetItemDailyRevenueRequest>;
export declare const CWorkshopGetItemDailyRevenueResponse: MessageFns<CWorkshopGetItemDailyRevenueResponse>;
export declare const CWorkshopGetItemDailyRevenueResponse_CountryDailyRevenue: MessageFns<CWorkshopGetItemDailyRevenueResponse_CountryDailyRevenue>;
export declare const CWorkshopGetPackageDailyRevenueRequest: MessageFns<CWorkshopGetPackageDailyRevenueRequest>;
export declare const CWorkshopGetPackageDailyRevenueResponse: MessageFns<CWorkshopGetPackageDailyRevenueResponse>;
export declare const CWorkshopGetPackageDailyRevenueResponse_CountryDailyRevenue: MessageFns<CWorkshopGetPackageDailyRevenueResponse_CountryDailyRevenue>;
export declare const CMsgSQLGCToGCGrantBackpackSlots: MessageFns<CMsgSQLGCToGCGrantBackpackSlots>;
export declare const CMsgClientToGCLookupAccountName: MessageFns<CMsgClientToGCLookupAccountName>;
export declare const CMsgClientToGCLookupAccountNameResponse: MessageFns<CMsgClientToGCLookupAccountNameResponse>;
export declare const CMsgClientToGCCreateStaticRecipe: MessageFns<CMsgClientToGCCreateStaticRecipe>;
export declare const CMsgClientToGCCreateStaticRecipe_Item: MessageFns<CMsgClientToGCCreateStaticRecipe_Item>;
export declare const CMsgClientToGCCreateStaticRecipeResponse: MessageFns<CMsgClientToGCCreateStaticRecipeResponse>;
export declare const CMsgClientToGCCreateStaticRecipeResponse_OutputItem: MessageFns<CMsgClientToGCCreateStaticRecipeResponse_OutputItem>;
export declare const CMsgClientToGCCreateStaticRecipeResponse_InputError: MessageFns<CMsgClientToGCCreateStaticRecipeResponse_InputError>;
export declare const CMsgClientToGCCreateStaticRecipeResponse_AdditionalOutput: MessageFns<CMsgClientToGCCreateStaticRecipeResponse_AdditionalOutput>;
export declare const CMsgProcessTransactionOrder: MessageFns<CMsgProcessTransactionOrder>;
export declare const CMsgProcessTransactionOrder_Item: MessageFns<CMsgProcessTransactionOrder_Item>;
export declare const CMsgGCToGCStoreProcessCDKeyTransaction: MessageFns<CMsgGCToGCStoreProcessCDKeyTransaction>;
export declare const CMsgGCToGCStoreProcessCDKeyTransactionResponse: MessageFns<CMsgGCToGCStoreProcessCDKeyTransactionResponse>;
export declare const CMsgGCToGCStoreProcessSettlement: MessageFns<CMsgGCToGCStoreProcessSettlement>;
export declare const CMsgGCToGCStoreProcessSettlementResponse: MessageFns<CMsgGCToGCStoreProcessSettlementResponse>;
export declare const CMsgGCToGCBroadcastConsoleCommand: MessageFns<CMsgGCToGCBroadcastConsoleCommand>;
export declare const CMsgGCToGCConsoleOutput: MessageFns<CMsgGCToGCConsoleOutput>;
export declare const CMsgGCToGCConsoleOutput_OutputLine: MessageFns<CMsgGCToGCConsoleOutput_OutputLine>;
export declare const CMsgItemAges: MessageFns<CMsgItemAges>;
export declare const CMsgItemAges_MaxItemIDTimestamp: MessageFns<CMsgItemAges_MaxItemIDTimestamp>;
export declare const CMsgGCToGCInternalTestMsg: MessageFns<CMsgGCToGCInternalTestMsg>;
export declare const CMsgGCToGCClientServerVersionsUpdated: MessageFns<CMsgGCToGCClientServerVersionsUpdated>;
export declare const CMsgGCToGCBroadcastMessageFromSub: MessageFns<CMsgGCToGCBroadcastMessageFromSub>;
export declare const CMsgGCToClientCurrencyPricePoints: MessageFns<CMsgGCToClientCurrencyPricePoints>;
export declare const CMsgGCToClientCurrencyPricePoints_Currency: MessageFns<CMsgGCToClientCurrencyPricePoints_Currency>;
export declare const CMsgBannedWordList: MessageFns<CMsgBannedWordList>;
export declare const CMsgGCToGCFlushSteamInventoryCache: MessageFns<CMsgGCToGCFlushSteamInventoryCache>;
export declare const CMsgGCToGCFlushSteamInventoryCache_Key: MessageFns<CMsgGCToGCFlushSteamInventoryCache_Key>;
export declare const CMsgGCToGCUpdateSubscriptionItems: MessageFns<CMsgGCToGCUpdateSubscriptionItems>;
export declare const CMsgGCToGCSelfPing: MessageFns<CMsgGCToGCSelfPing>;
export declare const CMsgGCToGCGetInfuxIntervalStats: MessageFns<CMsgGCToGCGetInfuxIntervalStats>;
export declare const CMsgGCToGCGetInfuxIntervalStatsResponse: MessageFns<CMsgGCToGCGetInfuxIntervalStatsResponse>;
export declare const CMsgGCToGCPurchaseSucceeded: MessageFns<CMsgGCToGCPurchaseSucceeded>;
export declare const CMsgClientToGCGetLimitedItemPurchaseQuantity: MessageFns<CMsgClientToGCGetLimitedItemPurchaseQuantity>;
export declare const CMsgClientToGCGetLimitedItemPurchaseQuantityResponse: MessageFns<CMsgClientToGCGetLimitedItemPurchaseQuantityResponse>;
export declare const CMsgClientToGCGetInFlightItemCharges: MessageFns<CMsgClientToGCGetInFlightItemCharges>;
export declare const CMsgClientToGCGetInFlightItemChargesResponse: MessageFns<CMsgClientToGCGetInFlightItemChargesResponse>;
export declare const CMsgClientToGCPurchaseChargeCostItems: MessageFns<CMsgClientToGCPurchaseChargeCostItems>;
export declare const CMsgClientToGCPurchaseChargeCostItems_Item: MessageFns<CMsgClientToGCPurchaseChargeCostItems_Item>;
export declare const CMsgClientToGCPurchaseChargeCostItemsResponse: MessageFns<CMsgClientToGCPurchaseChargeCostItemsResponse>;
export declare const CMsgGCToClientInFlightChargesUpdated: MessageFns<CMsgGCToClientInFlightChargesUpdated>;
export declare const CMsgGCToClientInFlightChargesUpdated_ItemCharges: MessageFns<CMsgGCToClientInFlightChargesUpdated_ItemCharges>;
export declare const CMsgClientToGCCancelUnfinalizedTransactions: MessageFns<CMsgClientToGCCancelUnfinalizedTransactions>;
export declare const CMsgClientToGCCancelUnfinalizedTransactionsResponse: MessageFns<CMsgClientToGCCancelUnfinalizedTransactionsResponse>;
export declare const CMsgGCToGCUpdateWelcomeMsg: MessageFns<CMsgGCToGCUpdateWelcomeMsg>;
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
//# sourceMappingURL=econ_gcmessages.d.ts.map