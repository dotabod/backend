#!/usr/bin/env -S npx ts-node --transpile-only
"use strict";
// vi: ft=typescript
// must run with --transpile-only cause the other files in the library depend on genny
// bit sketchy, but as this is a script i'm not too fussed
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingProtos = exports.findCMsg = exports.guessCMsg = exports.getMessageSender = void 0;
const tslib_1 = require("tslib");
const protobufs = tslib_1.__importStar(require("../protobufs"));
const utils_1 = require("../utils");
const debug = require('debug')('dota2-user:genny');
const TAB = '    ';
// search these protos
// EDOTAGCMsg: for most messages
// EGCBaseClientMsg: client hello and welcome
// ESOMsg: caches
// EGCBaseMsg: for party and lobby messages
const ENUMS_TO_SEARCH = ['EDOTAGCMsg', 'EGCBaseClientMsg', 'ESOMsg', 'EGCBaseMsg'];
var MessageSender;
(function (MessageSender) {
    MessageSender[MessageSender["UNSUPPORTED"] = 0] = "UNSUPPORTED";
    MessageSender[MessageSender["CLIENT"] = 1] = "CLIENT";
    MessageSender[MessageSender["GC"] = 2] = "GC";
})(MessageSender || (MessageSender = {}));
// we may set overrides as some pairings are difficult to match
//
// need to be very careful adding new overrides, as this list isn't type safe
// there's a check to see if a value is valid, but no check whether a key is valid
// TODO check if key is valid ?
// https://github.com/paralin/go-dota2/blob/99aa20c303eaee83526aa2cedff8b1a47273125b/client.go#L83
const OVERRIDES = {
    'ESOMsg.k_ESOMsg_Create': { CMsg: 'CMsgSOSingleObject', sender: MessageSender.GC },
    'ESOMsg.k_ESOMsg_Destroy': { CMsg: 'CMsgSOSingleObject', sender: MessageSender.GC },
    'ESOMsg.k_ESOMsg_UpdateMultiple': { CMsg: 'CMsgSOMultipleObjects', sender: MessageSender.GC },
    'ESOMsg.k_ESOMsg_CacheSubscribed': { sender: MessageSender.GC },
    'ESOMsg.k_ESOMsg_CacheUnsubscribed': { sender: MessageSender.GC },
    'EDOTAGCMsg.k_EMsgGCPracticeLobbyResponse': { CMsg: 'CMsgGenericResult' },
    // TODO, probably scrap long term
    'EGCBaseClientMsg.k_EMsgGCClientConnectionStatus': { sender: MessageSender.GC },
    'EGCBaseClientMsg.k_EMsgGCClientWelcome': { sender: MessageSender.GC },
    'EDOTAGCMsg.k_EMsgClientToGCGetProfileCardResponse': { CMsg: 'CMsgDOTAProfileCard', sender: MessageSender.GC },
};
// https://github.com/paralin/go-dota2/blob/master/apigen/msg_overrides.go
// https://github.com/paralin/go-dota2/blob/master/apigen/msg_sender.go
// a lot of "trust me bro" going on here
const getMessageSender = (messageName) => {
    const name = messageName.replace(/^k_EMsg/, '').replace(/^DOTA/, '');
    if (name.startsWith('SQL')) {
        return MessageSender.UNSUPPORTED;
    }
    if (name.includes('ClientToGC')) {
        if (name.endsWith('Response')) {
            return MessageSender.GC;
        }
        return MessageSender.CLIENT;
    }
    if (/GCResponseTo|GCRequestTo|GCToGC|^Server|^Gameserver|ServerToGC|GCToServer|GC_GameServer/.test(name)) {
        return MessageSender.UNSUPPORTED;
    }
    if (name.includes('GCToClient')) {
        return MessageSender.GC;
    }
    if (name.includes('SignOut')) {
        return MessageSender.UNSUPPORTED;
    }
    if (name.endsWith('Request')) {
        return MessageSender.CLIENT;
    }
    if (name.endsWith('Response')) {
        return MessageSender.GC;
    }
    // TODO
    // camel case splitting
    // just assuming client
    // TODO
    if (name.startsWith('GC')) {
        return MessageSender.CLIENT;
    }
    return MessageSender.CLIENT;
};
exports.getMessageSender = getMessageSender;
// more logic from https://github.com/paralin/go-dota2/blob/e8f172852608601dcb13ebc8aa442ced27938ad5/apigen/msg_func.go#L11
const guessCMsg = function* (protobufName, messageName) {
    // this inner generator function attempts to guess a matching CMsg based on known patterns
    const _guessCMsg = function* (messageName) {
        const name = messageName.replace(/^k_EMsg/, '').replace(/^GC/, '');
        yield name;
        yield name.replace(/^k_ESOMsg_/, '');
        yield 'GC' + name;
        const responseToResult = name.replace(/Response/g, 'Result');
        yield responseToResult;
        yield 'GC' + responseToResult;
        yield name.replace(/DOTA/g, '');
        yield name.replace(/GCToClient|ClientToGC/g, 'DOTA'); // https://github.com/ValvePython/dota2/blob/6ccebc3689e107746ec32ce07fc2f5cacecc0e18/dota2/msg.py#L84
        yield name.replace(/GCToClient/g, '').replace(/ClientToGC/g, '');
        yield 'DOTA' + name;
        // TODO
        // custom, and should maybe be overrides?
        // to match GCClient ConnectionStatus
        yield name.replace(/Client/, '');
        // experimental, untested: GCServer ConnectionStatus
        yield name.replace(/Server/, '');
    };
    // this generator outputs prefixes on top of the results from the previous generator
    for (const message of _guessCMsg(messageName)) {
        // handles EDOTAGCMsg and some things in EGCBaseMsg
        yield 'CMsg' + message;
        if (protobufName === 'EGCBaseClientMessage') {
            yield 'CGCMsg' + message;
        }
        if (protobufName === 'ESOMsg') {
            yield 'CMsgSO' + message;
        }
    }
};
exports.guessCMsg = guessCMsg;
// for a specific kMsg/enumName+messageName, find a CMsg
const findCMsg = (enumName, messageName) => {
    let sender;
    let CMsg;
    const override = OVERRIDES[enumName + '.' + messageName];
    if (override) {
        if (override.CMsg) {
            // @ts-ignore
            CMsg = protobufs[override.CMsg];
        }
        if (override.sender) {
            sender = override.sender;
        }
        if (override.CMsg && !CMsg) {
            throw new Error(`Invalid override for message: ${messageName}. ${override.CMsg} does not exist`);
        }
    }
    if (!sender) {
        sender = (0, exports.getMessageSender)(messageName);
    }
    if (sender === MessageSender.UNSUPPORTED) {
        debug('Skipping message %s as message sender is UNSUPPORTED', messageName);
        return;
    }
    // return early if we have an override for CMsg
    if (override?.CMsg) {
        return { CMsg, CMsgName: override.CMsg, sender };
    }
    // loop through matches from our guesser, see if any of them exist in the protobufs object
    for (const CMsgName of (0, exports.guessCMsg)(enumName, messageName)) {
        debug('Searching protos for %s', CMsgName);
        // @ts-ignore
        CMsg = protobufs[CMsgName];
        if (CMsg) {
            return { CMsg, CMsgName, sender };
        }
    }
};
exports.findCMsg = findCMsg;
// generates each kMsg + CMSg combination, if any, for the enums given
const findMatchingProtos = function* (enums) {
    for (const enumName of enums) {
        // @ts-ignore
        const _enum = protobufs[enumName];
        if (!_enum) {
            throw Error(`Could not find enum: ${enumName}, was it built by protoc?`);
        }
        for (const messageName of (0, utils_1.getEnumValues)(_enum)) {
            const CMsg = (0, exports.findCMsg)(enumName, messageName);
            if (!CMsg) {
                debug('No CMsg found for: %s', messageName);
            }
            else {
                debug('Found CMsg: %s for: %s', CMsg.CMsgName, messageName);
                yield { kMsg: enumName + '.' + messageName, CMsg: CMsg.CMsgName, sender: CMsg.sender };
            }
        }
    }
};
exports.findMatchingProtos = findMatchingProtos;
// instead of using TypeScript utilities to get the GCEvents type
// which can cause issues on IDEs
// pre-generate the types and write them out
// see: https://github.com/itsjfx/node-dota2-user/issues/9
const outputGCEventsType = (protos) => {
    console.log('export type GCEvents = {');
    for (const proto of protos) {
        if (proto.sender !== MessageSender.GC) {
            continue;
        }
        console.log(TAB + `[protobufs.${proto.kMsg}]: (data: protobufs.${proto.CMsg}) => void;`);
    }
    console.log('};');
};
// spit out our strictly typed objects
const outputObject = (protos, objectName, sender) => {
    console.log(`export const ${objectName} = {`);
    for (const proto of protos) {
        if (proto.sender !== sender) {
            continue;
        }
        // ts-proto now outputs a static interface around all values https://github.com/stephenh/ts-proto/pull/1104
        // but as we import * where we do export * and omit ts-proto helper types
        // we lose context of the MessageFns type
        // which also causes issues when we want to run tsc with declarations
        // so we can cast the type explictly
        console.log(TAB + `[protobufs.${proto.kMsg}]: protobufs.${proto.CMsg} as MessageFns<protobufs.${proto.CMsg}>,`);
    }
    console.log('};');
    console.log(`Object.freeze(${objectName});`);
    console.log(`export type ${objectName}Type = {`);
    for (const proto of protos) {
        if (proto.sender !== sender) {
            continue;
        }
        // ts-proto now outputs a static interface around all values https://github.com/stephenh/ts-proto/pull/1104
        // but as we import * where we do export * and omit ts-proto helper types
        // we lose context of the MessageFns type
        // which also causes issues when we want to run tsc with declarations
        // so we can cast the type explictly
        console.log(TAB + `[protobufs.${proto.kMsg}]: protobufs.${proto.CMsg};`);
    }
    console.log('};');
};
// cli
const main = async () => {
    // with 2 separate objects it's easier not to live generate the protobufs
    const protos = [...(0, exports.findMatchingProtos)(ENUMS_TO_SEARCH)];
    console.log("import * as protobufs from './index';");
    console.log("import { MessageFns } from './protobuf-utils';");
    outputObject(protos, 'ClientProtobufs', MessageSender.CLIENT);
    outputObject(protos, 'GCProtobufs', MessageSender.GC);
    outputGCEventsType(protos);
    console.log('export const AllProtobufs = { ...ClientProtobufs, ...GCProtobufs };');
    console.log('Object.freeze(AllProtobufs);');
    console.log('export type AllProtobufsType = ClientProtobufsType & GCProtobufsType;');
};
if (require.main === module) {
    main();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VubnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvYmluL2dlbm55LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0Esb0JBQW9CO0FBQ3BCLHNGQUFzRjtBQUN0RiwwREFBMEQ7Ozs7QUFFMUQsZ0VBQTBDO0FBQzFDLG9DQUF5QztBQUN6QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUVuRCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUM7QUFFbkIsc0JBQXNCO0FBQ3RCLGdDQUFnQztBQUNoQyw2Q0FBNkM7QUFDN0MsaUJBQWlCO0FBQ2pCLDJDQUEyQztBQUMzQyxNQUFNLGVBQWUsR0FBRyxDQUFDLFlBQVksRUFBRSxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFFbkYsSUFBSyxhQUlKO0FBSkQsV0FBSyxhQUFhO0lBQ2QsK0RBQWUsQ0FBQTtJQUNmLHFEQUFVLENBQUE7SUFDViw2Q0FBTSxDQUFBO0FBQ1YsQ0FBQyxFQUpJLGFBQWEsS0FBYixhQUFhLFFBSWpCO0FBUUQsK0RBQStEO0FBQy9ELEVBQUU7QUFDRiw2RUFBNkU7QUFDN0Usa0ZBQWtGO0FBQ2xGLCtCQUErQjtBQUMvQixrR0FBa0c7QUFDbEcsTUFBTSxTQUFTLEdBQWM7SUFDekIsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUU7SUFDbEYseUJBQXlCLEVBQUUsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUU7SUFDbkYsZ0NBQWdDLEVBQUUsRUFBRSxJQUFJLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUU7SUFDN0YsaUNBQWlDLEVBQUUsRUFBRSxNQUFNLEVBQUUsYUFBYSxDQUFDLEVBQUUsRUFBRTtJQUMv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