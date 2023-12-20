import { Packet } from '../types/index.js';
export declare function getAccountsFromMatch({ gsi, searchMatchId, searchPlayers, }?: {
    gsi?: Packet;
    searchMatchId?: string;
    searchPlayers?: {
        heroid: number;
        accountid: number;
    }[];
}): Promise<{
    matchPlayers: {
        heroid: number;
        accountid: number;
    }[];
    accountIds: number[];
}>;
//# sourceMappingURL=getAccountsFromMatch.d.ts.map