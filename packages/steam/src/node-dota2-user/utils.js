"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtendedEventEmitter = exports.getEnumValues = exports.getProtobufForMessage = exports.Dota2UserError = void 0;
const node_events_1 = require("node:events");
const protobuf_mappings_1 = require("./protobufs/protobuf-mappings");
class Dota2UserError extends Error {
}
exports.Dota2UserError = Dota2UserError;
// TODO maybe this should be attached to Dota2User
const getProtobufForMessage = (messageId) => {
    return protobuf_mappings_1.AllProtobufs[messageId];
};
exports.getProtobufForMessage = getProtobufForMessage;
const getEnumValues = (_enum) => {
    const keys = Object.keys(_enum);
    return keys.splice(keys.length / 2);
};
exports.getEnumValues = getEnumValues;
// TODO use EventEmitter for now, may move to a third party one
/**
 * Slightly extended out of the box EventEmitter
 *
 * @remarks
 * * The `eventName` argument for most methods can also be a `number`.
 *   * Numbers get type-casted to strings.
 *   * This is to provide a friendlier way when using enum values which are numbers
 * * New `onAny` method which provides a listener that fires when any event is emitted.
 */
class ExtendedEventEmitter extends node_events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.on = this.addListener;
        this.off = this.removeListener;
    }
    emit(eventName, ...args) {
        // emit to any BEFORE casting to a string
        if (eventName !== ExtendedEventEmitter.AnyEvent) {
            super.emit(ExtendedEventEmitter.AnyEvent, eventName, ...args);
        }
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.emit(eventName, ...args);
    }
    addListener(eventName, listener) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.on(eventName, listener);
    }
    // hack, cause getting a static type (AnyEvent + any) in a key is difficult
    // effectively alias for on(ExtendedEventEmitter.AnyEvent, (...)) -- but with correct types for the listener arg
    // note: eventName could be a number, if it was emitted as a number
    onAny(listener) {
        return super.on(ExtendedEventEmitter.AnyEvent, listener);
    }
    offAny(listener) {
        return super.off(ExtendedEventEmitter.AnyEvent, listener);
    }
    listenerCount(eventName) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.listenerCount(eventName);
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    listeners(eventName) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.listeners(eventName);
    }
    once(eventName, listener) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.once(eventName, listener);
    }
    prependListener(eventName, listener) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.prependListener(eventName, listener);
    }
    prependOnceListener(eventName, listener) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.prependListener(eventName, listener);
    }
    removeAllListeners(event) {
        if (typeof event === 'number') {
            event = event.toString();
        }
        return super.removeAllListeners(event);
    }
    removeListener(eventName, listener) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.removeListener(eventName, listener);
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    rawListeners(eventName) {
        if (typeof eventName === 'number') {
            eventName = eventName.toString();
        }
        return super.rawListeners(eventName);
    }
}
exports.ExtendedEventEmitter = ExtendedEventEmitter;
ExtendedEventEmitter.AnyEvent = Symbol('AnyEvent');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBQTJDO0FBQzNDLHFFQUE2RDtBQUU3RCxNQUFhLGNBQWUsU0FBUSxLQUFLO0NBQUc7QUFBNUMsd0NBQTRDO0FBRTVDLGtEQUFrRDtBQUMzQyxNQUFNLHFCQUFxQixHQUFHLENBQUMsU0FBb0MsRUFBOEQsRUFBRTtJQUN0SSxPQUFPLGdDQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDbkMsQ0FBQyxDQUFDO0FBRlcsUUFBQSxxQkFBcUIseUJBRWhDO0FBRUssTUFBTSxhQUFhLEdBQUcsQ0FBQyxLQUF1QixFQUFFLEVBQUU7SUFDckQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN4QyxDQUFDLENBQUM7QUFIVyxRQUFBLGFBQWEsaUJBR3hCO0FBOEJGLCtEQUErRDtBQUMvRDs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsb0JBQXFCLFNBQVEsMEJBQVk7SUFBdEQ7O1FBbUJJLE9BQUUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBeUJ0QixRQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztJQXNDOUIsQ0FBQztJQS9FRyxJQUFJLENBQUMsU0FBbUMsRUFBRSxHQUFHLElBQVM7UUFDbEQseUNBQXlDO1FBQ3pDLElBQUksU0FBUyxLQUFLLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ2xFLENBQUM7UUFDRCxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2hDLFNBQVMsR0FB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