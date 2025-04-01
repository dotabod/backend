import { EventEmitter } from 'node:events';
import { AllProtobufs } from './protobufs/protobuf-mappings';
export declare class Dota2UserError extends Error {
}
export declare const getProtobufForMessage: (messageId: keyof typeof AllProtobufs) => (typeof AllProtobufs)[keyof typeof AllProtobufs] | undefined;
export declare const getEnumValues: (_enum: Record<any, any>) => string[];
export type ListenerSignature<L> = {
    [E in keyof L]: (...args: any[]) => any;
};
export type DefaultListener = {
    [k: string]: (...args: any[]) => any;
};
export interface TypedEmitter<L extends ListenerSignature<L> = DefaultListener> {
    addListener<U extends keyof L>(event: U, listener: L[U]): this;
    prependListener<U extends keyof L>(event: U, listener: L[U]): this;
    prependOnceListener<U extends keyof L>(event: U, listener: L[U]): this;
    removeListener<U extends keyof L>(event: U, listener: L[U]): this;
    removeAllListeners(event?: keyof L): this;
    once<U extends keyof L>(event: U, listener: L[U]): this;
    on<U extends keyof L>(event: U, listener: L[U]): this;
    onAny<U extends keyof L>(listener: (eventName: keyof L, ...args: Parameters<L[U]>) => void): this;
    off<U extends keyof L>(event: U, listener: L[U]): this;
    emit<U extends keyof L>(event: U, ...args: Parameters<L[U]>): boolean;
    eventNames<U extends keyof L>(): U[];
    listenerCount(type: keyof L): number;
    listeners<U extends keyof L>(type: U): L[U][];
    rawListeners<U extends keyof L>(type: U): L[U][];
    getMaxListeners(): number;
    setMaxListeners(n: number): this;
}
/**
 * Slightly extended out of the box EventEmitter
 *
 * @remarks
 * * The `eventName` argument for most methods can also be a `number`.
 *   * Numbers get type-casted to strings.
 *   * This is to provide a friendlier way when using enum values which are numbers
 * * New `onAny` method which provides a listener that fires when any event is emitted.
 */
export declare class ExtendedEventEmitter extends EventEmitter {
    static readonly AnyEvent: unique symbol;
    emit(eventName: string | symbol | number, ...args: any): boolean;
    addListener(eventName: string | symbol | number, listener: (...args: any[]) => void): this;
    on: (eventName: string | symbol | number, listener: (...args: any[]) => void) => this;
    onAny(listener: (eventName: string | symbol | number, ...args: any[]) => void): this;
    offAny(listener: (eventName: string | symbol | number, ...args: any[]) => void): this;
    listenerCount(eventName: string | symbol | number): number;
    listeners(eventName: string | symbol | number): Function[];
    off: (eventName: string | symbol | number, listener: (...args: any[]) => void) => this;
    once(eventName: string | symbol | number, listener: (...args: any[]) => void): this;
    prependListener(eventName: string | symbol | number, listener: (...args: any[]) => void): this;
    prependOnceListener(eventName: string | symbol | number, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string | symbol | undefined | number): this;
    removeListener(eventName: string | symbol | number, listener: (...args: any[]) => void): this;
    rawListeners(eventName: string | symbol | number): Function[];
}
//# sourceMappingURL=utils.d.ts.map