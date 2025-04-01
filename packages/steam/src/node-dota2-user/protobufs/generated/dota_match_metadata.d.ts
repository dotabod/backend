import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import { CSOEconItemAttribute, CSOEconItemEquipped } from "./base_gcmessages";
import { CMsgTrackedStat } from "./dota_gcmessages_common";
import { CMsgMatchMatchmakingStats, CMvpData } from "./dota_gcmessages_common_match_management";
import { CMsgOverworldTokenQuantity } from "./dota_gcmessages_common_overworld";
import { dotaGcTeam, EDOTAMMRBoostType, EEvent } from "./dota_shared_enums";
import { CExtraMsgBlock } from "./gcsdk_gcmessages";
export interface CDOTAMatchMetadataFile {
    version: number;
    matchId: string;
    metadata: CDOTAMatchMetadata | undefined;
    privateMetadata: Buffer;
}
export interface CDOTAMatchMetadata {
    teams: CDOTAMatchMetadata_Team[];
    lobbyId: string;
    reportUntilTime: string;
    eventGameCustomTable: Buffer;
    primaryEventId: number;
    matchmakingStats: CMsgMatchMatchmakingStats | undefined;
    mvpData: CMvpData | undefined;
    guildChallengeProgress: CDOTAMatchMetadata_GuildChallengeProgress[];
    customPostGameTable: Buffer;
    matchTips: CDOTAMatchMetadata_Tip[];
    matchTrackedStats: CMsgTrackedStat[];
}
export interface CDOTAMatchMetadata_EconItem {
    defIndex: number;
    quality: number;
    attribute: CSOEconItemAttribute[];
    style: number;
    equippedState: CSOEconItemEquipped[];
}
export interface CDOTAMatchMetadata_Team {
    dotaTeam: number;
    players: CDOTAMatchMetadata_Team_Player[];
    graphExperience: number[];
    graphGoldEarned: number[];
    graphNetWorth: number[];
    cmFirstPick: boolean;
    cmCaptainPlayerId: number;
    cmPenalty: number;
    teamTrackedStats: CMsgTrackedStat[];
}
export interface CDOTAMatchMetadata_Team_PlayerKill {
    victimSlot: number;
    count: number;
}
export interface CDOTAMatchMetadata_Team_ItemPurchase {
    itemId: number;
    purchaseTime: number;
}
export interface CDOTAMatchMetadata_Team_InventorySnapshot {
    itemId: number[];
    gameTime: number;
    kills: number;
    deaths: number;
    assists: number;
    level: number;
    backpackItemId: number[];
    neutralItemId: number;
}
export interface CDOTAMatchMetadata_Team_AutoStyleCriteria {
    nameToken: number;
    value: number;
}
export interface CDOTAMatchMetadata_Team_StrangeGemProgress {
    killEaterType: number;
    gemItemDefIndex: number;
    requiredHeroId: number;
    startingValue: number;
    endingValue: number;
    ownerItemDefIndex: number;
    ownerItemId: string;
}
export interface CDOTAMatchMetadata_Team_VictoryPrediction {
    itemId: string;
    itemDefIndex: number;
    startingValue: number;
    isVictory: boolean;
}
export interface CDOTAMatchMetadata_Team_SubChallenge {
    slotId: number;
    startValue: number;
    endValue: number;
    completed: boolean;
}
export interface CDOTAMatchMetadata_Team_CavernChallengeResult {
    completedPathId: number;
    claimedRoomId: number;
}
export interface CDOTAMatchMetadata_Team_ActionGrant {
    actionId: number;
    quantity: number;
    audit: number;
    auditData: string;
}
export interface CDOTAMatchMetadata_Team_CandyGrant {
    points: number;
    reason: number;
}
export interface CDOTAMatchMetadata_Team_PeriodicResourceData {
    periodicResourceId: number;
    remaining: number;
    max: number;
}
export interface CDOTAMatchMetadata_Team_EventData {
    eventId: number;
    eventPoints: number;
    challengeInstanceId: number;
    challengeQuestId: number;
    challengeQuestChallengeId: number;
    challengeCompleted: boolean;
    challengeRankCompleted: number;
    challengeRankPreviouslyCompleted: number;
    eventOwned: boolean;
    subChallengesWithProgress: CDOTAMatchMetadata_Team_SubChallenge[];
    wagerWinnings: number;
    cavernChallengeActive: boolean;
    cavernChallengeWinnings: number;
    amountWagered: number;
    periodicPointAdjustments: number;
    cavernChallengeMapResults: CDOTAMatchMetadata_Team_CavernChallengeResult[];
    cavernChallengePlusShardWinnings: number;
    actionsGranted: CDOTAMatchMetadata_Team_ActionGrant[];
    cavernCrawlMapVariant: number;
    teamWagerBonusPct: number;
    wagerStreakPct: number;
    candyPointsGranted: CDOTAMatchMetadata_Team_CandyGrant[];
    activeSeasonId: number;
    cavernCrawlHalfCredit: boolean;
    periodicResources: CDOTAMatchMetadata_Team_PeriodicResourceData[];
    extraEventMessages: CExtraMsgBlock[];
}
export interface CDOTAMatchMetadata_Team_FeaturedGamemodeProgress {
    startValue: number;
    endValue: number;
    maxValue: number;
}
export interface CDOTAMatchMetadata_Team_Player {
    abilityUpgrades: number[];
    playerSlot: number;
    kills: CDOTAMatchMetadata_Team_PlayerKill[];
    items: CDOTAMatchMetadata_Team_ItemPurchase[];
    avgKillsX16: number;
    avgDeathsX16: number;
    avgAssistsX16: number;
    avgGpmX16: number;
    avgXpmX16: number;
    bestKillsX16: number;
    bestAssistsX16: number;
    bestGpmX16: number;
    bestXpmX16: number;
    winStreak: number;
    bestWinStreak: number;
    fightScore: number;
    farmScore: number;
    supportScore: number;
    pushScore: number;
    levelUpTimes: number[];
    graphNetWorth: number[];
    inventorySnapshot: CDOTAMatchMetadata_Team_InventorySnapshot[];
    avgStatsCalibrated: boolean;
    autoStyleCriteria: CDOTAMatchMetadata_Team_AutoStyleCriteria[];
    eventData: CDOTAMatchMetadata_Team_EventData[];
    strangeGemProgress: CDOTAMatchMetadata_Team_StrangeGemProgress[];
    heroXp: number;
    campsStacked: number;
    victoryPrediction: CDOTAMatchMetadata_Team_VictoryPrediction[];
    laneSelectionFlags: number;
    rampages: number;
    tripleKills: number;
    aegisSnatched: number;
    rapiersPurchased: number;
    couriersKilled: number;
    netWorthRank: number;
    supportGoldSpent: number;
    observerWardsPlaced: number;
    sentryWardsPlaced: number;
    wardsDewarded: number;
    stunDuration: number;
    rankMmrBoostType: EDOTAMMRBoostType;
    contractProgress: CDOTAMatchMetadata_Team_Player_ContractProgress[];
    guildIds: number[];
    graphHeroDamage: number[];
    teamNumber: dotaGcTeam;
    teamSlot: number;
    featuredGamemodeProgress: CDOTAMatchMetadata_Team_FeaturedGamemodeProgress | undefined;
    featuredHeroStickerIndex: number;
    featuredHeroStickerQuality: number;
    equippedEconItems: CDOTAMatchMetadata_EconItem[];
    gamePlayerId: number;
    playerTrackedStats: CMsgTrackedStat[];
    overworldRewards: CDOTAMatchMetadata_Team_Player_OverworldRewards | undefined;
}
export interface CDOTAMatchMetadata_Team_Player_ContractProgress {
    guildId: number;
    eventId: number;
    challengeInstanceId: number;
    challengeParameter: number;
    contractStars: number;
    contractSlot: number;
    completed: boolean;
}
export interface CDOTAMatchMetadata_Team_Player_OverworldRewards {
    overworldId: number;
    tokens: CMsgOverworldTokenQuantity | undefined;
}
export interface CDOTAMatchMetadata_GuildChallengeProgress {
    guildId: number;
    eventId: EEvent;
    challengeInstanceId: number;
    challengeParameter: number;
    challengeTimestamp: number;
    challengeProgressAtStart: number;
    challengeProgressAccumulated: number;
    individualProgress: CDOTAMatchMetadata_GuildChallengeProgress_IndividualProgress[];
}
export interface CDOTAMatchMetadata_GuildChallengeProgress_IndividualProgress {
    progress: number;
    playerSlot: number;
}
export interface CDOTAMatchMetadata_Tip {
    sourcePlayerSlot: number;
    targetPlayerSlot: number;
    tipAmount: number;
    eventId: EEvent;
}
export interface CDOTAMatchPrivateMetadata {
    teams: CDOTAMatchPrivateMetadata_Team[];
    graphWinProbability: number[];
    stringNames: CDOTAMatchPrivateMetadata_StringName[];
}
export interface CDOTAMatchPrivateMetadata_StringName {
    id: number;
    name: string;
}
export interface CDOTAMatchPrivateMetadata_Team {
    dotaTeam: number;
    players: CDOTAMatchPrivateMetadata_Team_Player[];
    buildings: CDOTAMatchPrivateMetadata_Team_Building[];
}
export interface CDOTAMatchPrivateMetadata_Team_Player {
    playerSlot: number;
    positionStream: Buffer;
    combatSegments: CDOTAMatchPrivateMetadata_Team_Player_CombatSegment[];
    damageUnitNames: string[];
    buffRecords: CDOTAMatchPrivateMetadata_Team_Player_BuffRecord[];
    graphKills: number[];
    graphDeaths: number[];
    graphAssists: number[];
    graphLasthits: number[];
    graphDenies: number[];
    goldReceived: CDOTAMatchPrivateMetadata_Team_Player_GoldReceived | undefined;
    xpReceived: CDOTAMatchPrivateMetadata_Team_Player_XPReceived | undefined;
    teamNumber: dotaGcTeam;
    teamSlot: number;
}
export interface CDOTAMatchPrivateMetadata_Team_Player_CombatSegment {
    gameTime: number;
    damageByAbility: CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility[];
    healingByAbility: CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility[];
}
export interface CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility {
    sourceUnitIndex: number;
    abilityId: number;
    byHeroTargets: CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility_ByHeroTarget[];
}
export interface CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility_ByHeroTarget {
    heroId: number;
    damage: number;
}
export interface CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility {
    sourceUnitIndex: number;
    abilityId: number;
    byHeroTargets: CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility_ByHeroTarget[];
}
export interface CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility_ByHeroTarget {
    heroId: number;
    healing: number;
}
export interface CDOTAMatchPrivateMetadata_Team_Player_BuffRecord {
    buffAbilityId: number;
    buffModifierName: string;
    byHeroTargets: CDOTAMatchPrivateMetadata_Team_Player_BuffRecord_ByHeroTarget[];
}
export interface CDOTAMatchPrivateMetadata_Team_Player_BuffRecord_ByHeroTarget {
    heroId: number;
    elapsedDuration: number;
    isHidden: boolean;
}
export interface CDOTAMatchPrivateMetadata_Team_Player_GoldReceived {
    creep: number;
    heroes: number;
    bountyRunes: number;
    passive: number;
    buildings: number;
    abilities: number;
    wards: number;
    other: number;
}
export interface CDOTAMatchPrivateMetadata_Team_Player_XPReceived {
    creep: number;
    heroes: number;
    roshan: number;
    tomeOfKnowledge: number;
    outpost: number;
    other: number;
    abilities: number;
}
export interface CDOTAMatchPrivateMetadata_Team_Building {
    unitName: string;
    positionQuantX: number;
    positionQuantY: number;
    deathTime: number;
}
export declare const CDOTAMatchMetadataFile: MessageFns<CDOTAMatchMetadataFile>;
export declare const CDOTAMatchMetadata: MessageFns<CDOTAMatchMetadata>;
export declare const CDOTAMatchMetadata_EconItem: MessageFns<CDOTAMatchMetadata_EconItem>;
export declare const CDOTAMatchMetadata_Team: MessageFns<CDOTAMatchMetadata_Team>;
export declare const CDOTAMatchMetadata_Team_PlayerKill: MessageFns<CDOTAMatchMetadata_Team_PlayerKill>;
export declare const CDOTAMatchMetadata_Team_ItemPurchase: MessageFns<CDOTAMatchMetadata_Team_ItemPurchase>;
export declare const CDOTAMatchMetadata_Team_InventorySnapshot: MessageFns<CDOTAMatchMetadata_Team_InventorySnapshot>;
export declare const CDOTAMatchMetadata_Team_AutoStyleCriteria: MessageFns<CDOTAMatchMetadata_Team_AutoStyleCriteria>;
export declare const CDOTAMatchMetadata_Team_StrangeGemProgress: MessageFns<CDOTAMatchMetadata_Team_StrangeGemProgress>;
export declare const CDOTAMatchMetadata_Team_VictoryPrediction: MessageFns<CDOTAMatchMetadata_Team_VictoryPrediction>;
export declare const CDOTAMatchMetadata_Team_SubChallenge: MessageFns<CDOTAMatchMetadata_Team_SubChallenge>;
export declare const CDOTAMatchMetadata_Team_CavernChallengeResult: MessageFns<CDOTAMatchMetadata_Team_CavernChallengeResult>;
export declare const CDOTAMatchMetadata_Team_ActionGrant: MessageFns<CDOTAMatchMetadata_Team_ActionGrant>;
export declare const CDOTAMatchMetadata_Team_CandyGrant: MessageFns<CDOTAMatchMetadata_Team_CandyGrant>;
export declare const CDOTAMatchMetadata_Team_PeriodicResourceData: MessageFns<CDOTAMatchMetadata_Team_PeriodicResourceData>;
export declare const CDOTAMatchMetadata_Team_EventData: MessageFns<CDOTAMatchMetadata_Team_EventData>;
export declare const CDOTAMatchMetadata_Team_FeaturedGamemodeProgress: MessageFns<CDOTAMatchMetadata_Team_FeaturedGamemodeProgress>;
export declare const CDOTAMatchMetadata_Team_Player: MessageFns<CDOTAMatchMetadata_Team_Player>;
export declare const CDOTAMatchMetadata_Team_Player_ContractProgress: MessageFns<CDOTAMatchMetadata_Team_Player_ContractProgress>;
export declare const CDOTAMatchMetadata_Team_Player_OverworldRewards: MessageFns<CDOTAMatchMetadata_Team_Player_OverworldRewards>;
export declare const CDOTAMatchMetadata_GuildChallengeProgress: MessageFns<CDOTAMatchMetadata_GuildChallengeProgress>;
export declare const CDOTAMatchMetadata_GuildChallengeProgress_IndividualProgress: MessageFns<CDOTAMatchMetadata_GuildChallengeProgress_IndividualProgress>;
export declare const CDOTAMatchMetadata_Tip: MessageFns<CDOTAMatchMetadata_Tip>;
export declare const CDOTAMatchPrivateMetadata: MessageFns<CDOTAMatchPrivateMetadata>;
export declare const CDOTAMatchPrivateMetadata_StringName: MessageFns<CDOTAMatchPrivateMetadata_StringName>;
export declare const CDOTAMatchPrivateMetadata_Team: MessageFns<CDOTAMatchPrivateMetadata_Team>;
export declare const CDOTAMatchPrivateMetadata_Team_Player: MessageFns<CDOTAMatchPrivateMetadata_Team_Player>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_CombatSegment: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_CombatSegment>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility_ByHeroTarget: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_DamageByAbility_ByHeroTarget>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility_ByHeroTarget: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_CombatSegment_HealingByAbility_ByHeroTarget>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_BuffRecord: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_BuffRecord>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_BuffRecord_ByHeroTarget: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_BuffRecord_ByHeroTarget>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_GoldReceived: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_GoldReceived>;
export declare const CDOTAMatchPrivateMetadata_Team_Player_XPReceived: MessageFns<CDOTAMatchPrivateMetadata_Team_Player_XPReceived>;
export declare const CDOTAMatchPrivateMetadata_Team_Building: MessageFns<CDOTAMatchPrivateMetadata_Team_Building>;
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
//# sourceMappingURL=dota_match_metadata.d.ts.map