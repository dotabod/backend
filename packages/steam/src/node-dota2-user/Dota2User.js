"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dota2User = void 0;
const tslib_1 = require("tslib");
const node_events_1 = require("node:events");
const node_timers_1 = require("node:timers");
// Use import for ByteBuffer instead of type import
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
        this._nextJobId = 1;
        this._jobs = new Map();
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
        // Handle job responses
        this.router.on('job', (jobId, payload) => {
            const callback = this._jobs.get(jobId);
            if (callback) {
                callback(payload);
                this._jobs.delete(jobId);
            }
        });
    }
    _hookSteamUserEvents() {
        this._steam.on('receivedFromGC', (appid, msgType, payload) => {
            if (appid !== Dota2User.STEAM_APPID) {
                return; // we don't care
            }
            // Extract job_id if present in the header
            let jobId = null;
            if (payload.readUInt32LE && payload.length >= 18) {
                // Most GC messages have a header with job_id at offset 10
                jobId = payload.readUInt32LE(10);
                if (jobId === 0xffffffff) {
                    jobId = null;
                }
            }
            if (jobId && this._jobs.has(jobId)) {
                this.router.emit('job', jobId, payload);
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
    send(messageId, body) {
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            throw new utils_1.Dota2UserError(`Unable to find protobuf for message: ${messageId}`);
        }
        const buffer = Buffer.from(protobuf.encode(body).finish());
        this.sendRawBuffer(messageId, buffer);
    }
    // send a partial message, where all payload properties are optional, and missing values are filled in best effort
    sendPartial(messageId, body) {
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            throw new utils_1.Dota2UserError(`Unable to find protobuf for message: ${messageId}`);
        }
        const buffer = Buffer.from(protobuf.encode(protobuf.fromPartial(body)).finish());
        this.sendRawBuffer(messageId, buffer);
    }
    sendWithCallback(messageId, body, responseCallback) {
        const jobId = this._getNextJobId();
        this._jobs.set(jobId, responseCallback);
        // Create a buffer and set the job_id in the header
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            throw new utils_1.Dota2UserError(`Unable to find protobuf for message: ${messageId}`);
        }
        // Encode the message
        const messageBuffer = Buffer.from(protobuf.encode(protobuf.fromPartial(body)).finish());
        // Create a header with job_id
        const headerBuffer = Buffer.alloc(18);
        headerBuffer.writeUInt32LE(jobId, 10); // Set job_id at offset 10
        // Combine header and message
        const finalBuffer = Buffer.concat([headerBuffer, messageBuffer.slice(18)]);
        debug(`Sending GC message ${messageId} with job_id ${jobId}`);
        this._steam.sendToGC(Dota2User.STEAM_APPID, messageId, {}, finalBuffer);
    }
    sendRawBuffer(messageId, body) {
        if (!this._steam.steamID) {
            throw new utils_1.Dota2UserError('Cannot send GC message, not logged into Steam Client');
        }
        debug('Sending GC message %s', messageId);
        // Convert ByteBuffer to Buffer
        let buffer = body;
        if (body instanceof bytebuffer_1.default) {
            buffer = body.flip().toBuffer();
        }
        // TODO: not setting a callback, not sure how it functions
        this._steam.sendToGC(Dota2User.STEAM_APPID, messageId, {}, buffer);
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
            this._helloTimerMs = undefined;
        }
    }
    _getNextJobId() {
        const jobId = this._nextJobId++;
        if (this._nextJobId >= 0x10000) {
            this._nextJobId = 1;
        }
        return jobId;
    }
}
exports.Dota2User = Dota2User;
Dota2User.STEAM_APPID = 570;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90YTJVc2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0RvdGEyVXNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQUEsNkNBQTJDO0FBQzNDLDZDQUEyQztBQUUzQyxtREFBbUQ7QUFDbkQsb0VBQW9DO0FBRXBDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUU3QyxxQ0FBa0M7QUFDbEMsMkNBQW1FO0FBR25FLG1DQUFnRTtBQUVoRSxNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQztBQUNoQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQztBQUNqQyxNQUFNLDZCQUE2QixHQUFHLEtBQUssQ0FBQztBQUU1QyxNQUFhLFNBQVUsU0FBUSwwQkFBWTtJQWF2QyxZQUFZLEtBQWdCO1FBQ3hCLElBQUksS0FBSyxDQUFDLFdBQVcsS0FBSyxZQUFZLElBQUksQ0FBQyxDQUFDLGdCQUFnQixJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzNGLE1BQU0sSUFBSSxzQkFBYyxDQUFDLHlEQUF5RCxDQUFDLENBQUM7UUFDeEYsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzdDLE1BQU0sSUFBSSxzQkFBYyxDQUFDLDJEQUEyRCxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsY0FBYyxTQUFTLENBQUMsQ0FBQztZQUNsSixDQUFDO1FBQ0wsQ0FBQztRQUVELEtBQUssRUFBRSxDQUFD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