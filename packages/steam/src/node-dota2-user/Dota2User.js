"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dota2User = void 0;
const tslib_1 = require("tslib");
const node_events_1 = require("node:events");
const node_timers_1 = require("node:timers");
const bytebuffer_1 = tslib_1.__importDefault(require("bytebuffer"));
const debug = require('debug')('dota2-user');
const router_1 = require("./router");
const protobufs_1 = require("./protobufs");
const utils_1 = require("./utils");
const INITIAL_HELLO_DELAY = 500;
const DEFAULT_HELLO_DELAY = 1000;
const EXPONENTIAL_HELLO_BACKOFF_MAX = 60000;
class Dota2User extends node_events_1.EventEmitter {
    constructor(steam) {
        if (steam.packageName !== 'steam-user' || !('packageVersion' in steam) || !steam.constructor) {
            throw new utils_1.Dota2UserError('dota2-user v2 only supports steam-user v4.2.0 or later.');
        }
        else {
            const [major, minor] = steam.packageVersion.split('.');
            if (+major < 4 || (+major === 4 && +minor < 2)) {
                throw new utils_1.Dota2UserError(`dota2-user v2 only supports steam-user v4.2.0 or later. ${steam.constructor.name} v${steam.packageVersion} given.`);
            }
        }
        super();
        this.router = new router_1.Router();
        // State
        this._haveGCSession = false;
        this._inDota2 = false;
        // For callback tracking
        this._jobIdCounter = 0;
        this._callbacks = new Map();
        // For message type callbacks - storing callbacks by response message type
        this._messageHandlers = new Map();
        this._steam = steam;
        this._hookSteamUserEvents();
        this._hookRouterEvents();
    }
    get inDota2() {
        return this._inDota2;
    }
    get haveGCSession() {
        return this._haveGCSession;
    }
    // there's NO validation as to whether events have been hooked
    // so only called in the constructor once
    _hookRouterEvents() {
        this.router.on(protobufs_1.EGCBaseClientMsg.k_EMsgGCClientWelcome, (message) => {
            // Handle caches
            // this.inventory = this.inventory || [];
            debug('GC connection established');
            debug('Received welcome: %o', message);
            this._haveGCSession = true;
            this._clearHelloTimer();
            this.emit('connectedToGC');
        });
        this.router.on(protobufs_1.EGCBaseClientMsg.k_EMsgGCClientConnectionStatus, (data) => {
            if (data.status !== protobufs_1.GCConnectionStatus.GCConnectionStatus_HAVE_SESSION && this.haveGCSession) {
                debug('Connection status: %s; have session: %s', data.status, this.haveGCSession);
                this.emit('disconnectedFromGC', data.status);
                this._haveGCSession = false;
                this._connect(); // Try to reconnect
            }
        });
        // Add onAny listener to handle callbacks
        this.router.onAny((eventName, responseData) => {
            debug('Received event %s', eventName);
            debug('responseData: %o', responseData);
            // Method 1: Using job IDs (when available)
            const response = responseData;
            // Check for both camelCase and mixed case field names
            const jobId = response?.jobIdTarget || response?.jobidTarget;
            if (jobId !== undefined) {
                // Convert from string to number if needed
                const numericJobId = typeof jobId === 'string' ? parseInt(jobId, 10) : jobId;
                if (!isNaN(numericJobId) && this._callbacks.has(numericJobId)) {
                    debug('Found callback for job ID %s', numericJobId);
                    this._callbacks.get(numericJobId)?.(responseData);
                    this._callbacks.delete(numericJobId);
                    return; // If we handled it via job ID, don't process it via message type
                }
            }
            // Method 2: Using message type handlers (for messages without job IDs)
            const msgType = Number(eventName);
            if (!isNaN(msgType) && this._messageHandlers.has(msgType)) {
                const handlers = this._messageHandlers.get(msgType) || [];
                if (handlers.length > 0) {
                    debug('Found %d handlers for message type %s', handlers.length, msgType);
                    // Execute the first handler in the queue and remove it
                    const handler = handlers.shift();
                    if (handler)
                        handler(responseData);
                }
            }
        });
    }
    _hookSteamUserEvents() {
        this._steam.on('receivedFromGC', (appid, msgType, payload) => {
            if (appid !== Dota2User.STEAM_APPID) {
                return; // we don't care
            }
            this.router.route(msgType, payload);
        });
        this._steam.on('appLaunched', (appid) => {
            if (this.inDota2 || appid !== Dota2User.STEAM_APPID) {
                return;
            }
            this._inDota2 = true;
            if (!this.haveGCSession) {
                this._connect();
            }
        });
        this._steam.on('appQuit', (appid) => {
            if (!this.inDota2 || appid !== Dota2User.STEAM_APPID) {
                return;
            }
            this._handleAppQuit(false);
        });
        this._steam.on('disconnected', () => {
            this._handleAppQuit(true);
        });
        this._steam.on('error', () => {
            this._handleAppQuit(true);
        });
    }
    // Generate a unique job ID for callbacks
    _getNextJobId() {
        this._jobIdCounter = (this._jobIdCounter + 1) & 0xffff; // Keep it within uint16 range
        return this._jobIdCounter;
    }
    send(messageId, body) {
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            throw new utils_1.Dota2UserError(`Unable to find protobuf for message: ${messageId}`);
        }
        const buffer = Buffer.from(protobuf.encode(body).finish());
        return this.sendRawBuffer(messageId, buffer);
    }
    // Method for sending a message and registering a callback for the response
    // This version allows specifying which message type to expect in response
    sendWithCallback(messageId, body, responseType, callback) {
        if (!this._steam.steamID) {
            throw new utils_1.Dota2UserError('Cannot send GC message, not logged into Steam Client');
        }
        if (typeof responseType !== 'number') {
            throw new utils_1.Dota2UserError('Response type must be a valid message ID number');
        }
        debug('Sending GC message %s with callback for response type %s', messageId, responseType);
        // Register the callback with the message type
        if (!this._messageHandlers.has(responseType)) {
            this._messageHandlers.set(responseType, []);
        }
        this._messageHandlers.get(responseType)?.push(callback);
        // Try to use job IDs if possible as a backup
        let mergedBody = body;
        try {
            const jobId = this._getNextJobId();
            this._callbacks.set(jobId, callback);
            // Add job ID fields
            const jobIdFields = {
                jobIdSource: jobId.toString(),
                jobidSource: jobId.toString(),
            };
            // Merge with the original body
            mergedBody = Object.assign({}, body, jobIdFields);
            debug('Added job ID %s to request', jobId);
        }
        catch (error) {
            debug('Could not add job ID to request: %s', error);
            // Continue without job ID
        }
        this.sendPartial(messageId, mergedBody);
    }
    // send a partial message, where all payload properties are optional, and missing values are filled in best effort
    sendPartial(messageId, body) {
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            throw new utils_1.Dota2UserError(`Unable to find protobuf for message: ${messageId}`);
        }
        const buffer = Buffer.from(protobuf.encode(protobuf.fromPartial(body)).finish());
        return this.sendRawBuffer(messageId, buffer);
    }
    sendRawBuffer(messageId, body) {
        if (!this._steam.steamID) {
            throw new utils_1.Dota2UserError('Cannot send GC message, not logged into Steam Client');
        }
        debug('Sending GC message %s', messageId);
        // Convert ByteBuffer to Buffer
        if (body instanceof bytebuffer_1.default) {
            body = body.flip().toBuffer();
        }
        // TODO: not setting a callback, not sure how it functions
        this._steam.sendToGC(Dota2User.STEAM_APPID, messageId, {}, body);
    }
    _connect() {
        if (!this.inDota2 || this._helloTimer) {
            debug('Not trying to connect due to ' + (!this.inDota2 ? 'not in Dota 2' : 'has helloTimer'));
            return; // We're not in Dota 2 or we're already trying to connect
        }
        const sendHello = () => {
            if (!this.inDota2 || this.haveGCSession) {
                debug('Not sending hello because ' + (!this.inDota2 ? "we're no longer in Dota 2" : 'we have a session'));
                this._clearHelloTimer();
                return;
            }
            this.sendPartial(protobufs_1.EGCBaseClientMsg.k_EMsgGCClientHello, {});
            this._helloTimerMs = Math.min(EXPONENTIAL_HELLO_BACKOFF_MAX, (this._helloTimerMs || DEFAULT_HELLO_DELAY) * 2);
            this._helloTimer = setTimeout(() => sendHello(), this._helloTimerMs);
            debug('Sending hello, setting timer for next attempt to %s ms', this._helloTimerMs);
        };
        this._helloTimer = setTimeout(() => sendHello(), INITIAL_HELLO_DELAY);
    }
    _handleAppQuit(emitDisconnectEvent) {
        this._clearHelloTimer();
        // Clear any pending callbacks
        this._callbacks.clear();
        this._messageHandlers.clear();
        if (this.haveGCSession && emitDisconnectEvent) {
            this.emit('disconnectedFromGC', protobufs_1.GCConnectionStatus.GCConnectionStatus_NO_SESSION);
        }
        this._inDota2 = false;
        this._haveGCSession = false;
    }
    _clearHelloTimer() {
        if (this._helloTimer) {
            (0, node_timers_1.clearTimeout)(this._helloTimer);
            this._helloTimer = null;
            delete this._helloTimerMs;
        }
    }
}
exports.Dota2User = Dota2User;
Dota2User.STEAM_APPID = 570;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90YTJVc2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0RvdGEyVXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQUEsNkNBQTJDO0FBQzNDLDZDQUEyQztBQUUzQyxvRUFBb0M7QUFFcEMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTdDLHFDQUFrQztBQUNsQywyQ0FBbUU7QUFHbkUsbUNBQWdFO0FBRWhFLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBQ2hDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0FBQ2pDLE1BQU0sNkJBQTZCLEdBQUcsS0FBSyxDQUFDO0FBRTVDLE1BQWEsU0FBVSxTQUFRLDBCQUFZO0lBa0J2QyxZQUFZLEtBQWdCO1FBQ3hCLElBQUksS0FBSyxDQUFDLFdBQVcsS0FBSyxZQUFZLElBQUksQ0FBQyxDQUFDLGdCQUFnQixJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzNGLE1BQU0sSUFBSSxzQkFBYyxDQUFDLHlEQUF5RCxDQUFDLENBQUM7UUFDeEYsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzdDLE1BQU0sSUFBSSxzQkFBYyxDQUFDLDJEQUEyRCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsY0FBYyxTQUFTLENBQUMsQ0FBQztZQUNsSixDQUFDO1FBQ0wsQ0FBQztRQUVELEtBQUssRUFBRSxDQUFDO1FBMUJaLFdBQU0s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