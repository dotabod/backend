/// <reference types="node" />
import { Cards, DelayedGames } from './types/index.js';
interface steamUserDetails {
    account_name: string;
    password: string;
    sha_sentryfile?: Buffer;
}
declare class Dota {
    private static instance;
    private cache;
    private steamClient;
    private steamUser;
    dota2: any;
    constructor();
    getUserDetails(): {
        account_name: string;
        password: string;
    };
    loadServerList(): void;
    loadSentry(details: steamUserDetails): void;
    setupClientEventHandlers(details: steamUserDetails): void;
    handleLogOnResponse(logonResp: any): void;
    handleLoggedOff(eresult: any): void;
    handleClientError(error: any): void;
    handleServerUpdate(servers: any): void;
    setupUserEventHandlers(): void;
    handleMachineAuth(sentry: any, callback: any): void;
    setupDotaEventHandlers(): void;
    handleHelloTimeout(): void;
    logSteamError(eresult: any): void;
    isProduction(): boolean;
    getUserSteamServer: (steam32Id: number | string) => Promise<string>;
    fetchAndUpdateCard: (accountId: number) => Promise<Cards>;
    private fetchProfileCard;
    promiseTimeout: <T>(promise: Promise<T>, ms: number, reason: string) => Promise<T>;
    getCard(account: number): Promise<Cards>;
    private evictOldCacheEntries;
    private evictExtraCacheEntries;
    getCards(accounts: number[], refetchCards?: boolean): Promise<Cards[]>;
    GetRealTimeStats: ({ match_id, refetchCards, steam_server_id, token, forceRefetchAll, }: {
        forceRefetchAll?: boolean | undefined;
        match_id: string;
        refetchCards?: boolean | undefined;
        steam_server_id: string;
        token: string;
    }) => Promise<DelayedGames>;
    static getInstance(): Dota;
    exit(): Promise<boolean>;
}
export default Dota;
//# sourceMappingURL=steam.d.ts.map