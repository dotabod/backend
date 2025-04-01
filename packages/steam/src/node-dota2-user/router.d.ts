import { TypedEmitter } from './utils';
import { GCEvents as BaseGCEvents } from './protobufs/protobuf-mappings';
export interface GCEvents extends BaseGCEvents {
    job: (jobId: number, payload: Buffer) => void;
}
declare const Router_base: new () => TypedEmitter<GCEvents>;
export declare class Router extends Router_base {
    route(messageId: number, body: Buffer): void;
}
export {};
//# sourceMappingURL=router.d.ts.map