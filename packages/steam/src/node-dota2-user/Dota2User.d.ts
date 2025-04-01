import { EventEmitter } from 'node:events';
import ByteBuffer from 'bytebuffer';
import type SteamUser from 'steam-user';
import { Router } from './router';
import type { DeepPartial } from './protobufs/protobuf-utils';
import type { ClientProtobufsType } from './protobufs/protobuf-mappings';
export declare class Dota2User extends EventEmitter {
    static readonly STEAM_APPID = 570;
    router: Router;
    _steam: SteamUser;
    _haveGCSession: boolean;
    _inDota2: boolean;
    _helloTimer: NodeJS.Timeout | undefined | null;
    _helloTimerMs?: number | undefined;
    _nextJobId: number;
    _jobs: Map<number, (payload: Buffer) => void>;
    constructor(steam: SteamUser);
    get inDota2(): boolean;
    get haveGCSession(): boolean;
    _hookRouterEvents(): void;
    _hookSteamUserEvents(): void;
    send<T extends keyof ClientProtobufsType>(messageId: T, body: ClientProtobufsType[T]): void;
    sendPartial<T extends keyof ClientProtobufsType>(messageId: T, body: DeepPartial<ClientProtobufsType[T]>): void;
    sendWithCallback<T extends keyof ClientProtobufsType, R = Buffer>(messageId: T, body: DeepPartial<ClientProtobufsType[T]>, responseCallback: (response: R) => void): void;
    sendRawBuffer(messageId: number, body: Buffer | ByteBuffer): void;
    _connect(): void;
    _handleAppQuit(emitDisconnectEvent: boolean): void;
    _clearHelloTimer(): void;
    _getNextJobId(): number;
}
//# sourceMappingURL=Dota2User.d.ts.map