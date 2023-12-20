export declare const defaultSettings: {
    aegis: boolean;
    bets: boolean;
    betsInfo: {
        title: string;
        yes: string;
        no: string;
        duration: number;
    };
    battlepass: boolean;
    chatter: boolean;
    chatters: {
        midas: {
            enabled: boolean;
        };
        pause: {
            enabled: boolean;
        };
        smoke: {
            enabled: boolean;
        };
        passiveDeath: {
            enabled: boolean;
        };
        roshPickup: {
            enabled: boolean;
        };
        roshDeny: {
            enabled: boolean;
        };
        roshanKilled: {
            enabled: boolean;
        };
        tip: {
            enabled: boolean;
        };
        bounties: {
            enabled: boolean;
        };
        powerTreads: {
            enabled: boolean;
        };
        killstreak: {
            enabled: boolean;
        };
        firstBloodDeath: {
            enabled: boolean;
        };
        noTp: {
            enabled: boolean;
        };
        matchOutcome: {
            enabled: boolean;
        };
        commandsReady: {
            enabled: boolean;
        };
    };
    customMmr: string;
    commandAPM: boolean;
    commandAvg: boolean;
    commandCommands: boolean;
    commandDisable: boolean;
    commandDotabuff: boolean;
    commandGM: boolean;
    commandGPM: boolean;
    commandHero: boolean;
    commandLG: boolean;
    commandModsonly: boolean;
    commandNP: boolean;
    commandOpendota: boolean;
    commandPleb: boolean;
    commandRanked: boolean;
    commandSmurfs: boolean;
    commandWL: boolean;
    commandProfile: boolean;
    commandLGS: boolean;
    commandSteam: boolean;
    commandXPM: boolean;
    commandWinProbability: boolean;
    "minimap-blocker": boolean;
    minimapRight: boolean;
    mmr: null;
    "mmr-tracker": boolean;
    "obs-scene-switcher": boolean;
    "obs-dc": string;
    "obs-minimap": string;
    "obs-picks": string;
    "only-block-ranked": boolean;
    "picks-blocker": boolean;
    rosh: boolean;
    "minimap-simple": boolean;
    "minimap-xl": boolean;
    onlyParty: boolean;
    livePolls: boolean;
    streamDelay: number;
    commandDelay: boolean;
    commandBuilds: boolean;
    showRankMmr: boolean;
    showRankImage: boolean;
    showRankLeader: boolean;
    commandMmr: boolean;
    commandRosh: boolean;
    commandItems: boolean;
    notablePlayersOverlay: boolean;
    notablePlayersOverlayFlags: boolean;
    notablePlayersOverlayFlagsCmd: boolean;
    tellChatNewMMR: boolean;
    tellChatBets: boolean;
    queueBlocker: boolean;
};
export type SettingKeys = keyof typeof defaultSettings;
export declare const DBSettings: Record<"aegis" | "bets" | "betsInfo" | "battlepass" | "chatter" | "chatters" | "customMmr" | "commandAPM" | "commandAvg" | "commandCommands" | "commandDisable" | "commandDotabuff" | "commandGM" | "commandGPM" | "commandHero" | "commandLG" | "commandModsonly" | "commandNP" | "commandOpendota" | "commandPleb" | "commandRanked" | "commandSmurfs" | "commandWL" | "commandProfile" | "commandLGS" | "commandSteam" | "commandXPM" | "commandWinProbability" | "minimap-blocker" | "minimapRight" | "mmr" | "mmr-tracker" | "obs-scene-switcher" | "obs-dc" | "obs-minimap" | "obs-picks" | "only-block-ranked" | "picks-blocker" | "rosh" | "minimap-simple" | "minimap-xl" | "onlyParty" | "livePolls" | "streamDelay" | "commandDelay" | "commandBuilds" | "showRankMmr" | "showRankImage" | "showRankLeader" | "commandMmr" | "commandRosh" | "commandItems" | "notablePlayersOverlay" | "notablePlayersOverlayFlags" | "notablePlayersOverlayFlagsCmd" | "tellChatNewMMR" | "tellChatBets" | "queueBlocker", "aegis" | "bets" | "betsInfo" | "battlepass" | "chatter" | "chatters" | "customMmr" | "commandAPM" | "commandAvg" | "commandCommands" | "commandDisable" | "commandDotabuff" | "commandGM" | "commandGPM" | "commandHero" | "commandLG" | "commandModsonly" | "commandNP" | "commandOpendota" | "commandPleb" | "commandRanked" | "commandSmurfs" | "commandWL" | "commandProfile" | "commandLGS" | "commandSteam" | "commandXPM" | "commandWinProbability" | "minimap-blocker" | "minimapRight" | "mmr" | "mmr-tracker" | "obs-scene-switcher" | "obs-dc" | "obs-minimap" | "obs-picks" | "only-block-ranked" | "picks-blocker" | "rosh" | "minimap-simple" | "minimap-xl" | "onlyParty" | "livePolls" | "streamDelay" | "commandDelay" | "commandBuilds" | "showRankMmr" | "showRankImage" | "showRankLeader" | "commandMmr" | "commandRosh" | "commandItems" | "notablePlayersOverlay" | "notablePlayersOverlayFlags" | "notablePlayersOverlayFlagsCmd" | "tellChatNewMMR" | "tellChatBets" | "queueBlocker">;
export declare const getValueOrDefault: (key: SettingKeys, data?: {
    key: string;
    value: any;
}[] | undefined) => any;
//# sourceMappingURL=settings.d.ts.map