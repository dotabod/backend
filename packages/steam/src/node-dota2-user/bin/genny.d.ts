#!/usr/bin/env -S npx ts-node --transpile-only
declare enum MessageSender {
    UNSUPPORTED = 0,
    CLIENT = 1,
    GC = 2
}
type MatchingProtobuf = {
    kMsg: string;
    CMsg: string;
    sender: MessageSender;
};
export declare const getMessageSender: (messageName: string) => MessageSender;
export declare const guessCMsg: (protobufName: string, messageName: string) => Generator<string, void, unknown>;
export declare const findCMsg: (enumName: string, messageName: string) => {
    CMsg: any;
    CMsgName: string;
    sender: MessageSender.CLIENT | MessageSender.GC;
} | undefined;
export declare const findMatchingProtos: (enums: string[]) => Generator<MatchingProtobuf>;
export {};
//# sourceMappingURL=genny.d.ts.map