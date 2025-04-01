import { EventEmitter } from 'node:events';
import ByteBuffer from 'bytebuffer';
import SteamUser from 'steam-user';
import { Router } from './router';
import type { DeepPartial } from './protobufs/protobuf-utils';
import type { ClientProtobufsType, GCProtobufsType } from './protobufs/protobuf-mappings';
export declare class Dota2User extends EventEmitter {
    static readonly STEAM_APPID = 570;
    router: Router;
    _steam: SteamUser;
    _haveGCSession: boolean;
    _inDota2: boolean;
    _helloTimer: NodeJS.Timeout | undefined | null;
    _helloTimerMs?: number | undefined;
    _jobIdCounter: number;
    _callbacks: Map<number, (response: any) => void>;
    _messageHandlers: Map<number, ((response: any) => void)[]>;
    constructor(steam: SteamUser);
    get inDota2(): boolean;
    get haveGCSession(): boolean;
    _hookRouterEvents(): void;
    _hookSteamUserEvents(): void;
    private _getNextJobId;
    send<T extends keyof ClientProtobufsType>(messageId: T, body: ClientProtobufsType[T]): void;
    sendWithCallback<T extends keyof ClientProtobufsType, R extends keyof GCProtobufsType>(messageId: T, body: DeepPartial<ClientProtobufsType[T]>, responseType: R, callback: (response: GCProtobufsType[R]) => void): void;
    sendPartial<T extends keyof ClientProtobufsType>(messageId: T, body: DeepPartial<ClientProtobufsType[T]>): void;
    sendRawBuffer(messageId: number, body: Buffer | ByteBuffer): void;
    _connect(): void;
    _handleAppQuit(emitDisconnectEvent: boolean): void;
    _clearHelloTimer(): void;
}
//# sourceMappingURL=Dota2User.d.ts.map