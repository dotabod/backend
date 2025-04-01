import { TypedEmitter } from './utils';
import { GCEvents } from './protobufs/protobuf-mappings';
declare const Router_base: new () => TypedEmitter<GCEvents>;
export declare class Router extends Router_base {
    route(messageId: number, body: Buffer): void;
}
export {};
//# sourceMappingURL=router.d.ts.map