"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
const debug = require('debug')('dota2-user:router');
const utils_1 = require("./utils");
const protobuf_mappings_1 = require("./protobufs/protobuf-mappings");
class Router extends utils_1.ExtendedEventEmitter {
    route(messageId, body) {
        // let msgName = getMessageName(msgType) || msgType;
        // TODO when we import all the protos, find message name instead of printing just the messageId
        if (!(messageId in protobuf_mappings_1.GCProtobufs)) {
            debug("Not routing message %s as it's not a GC message", messageId);
            return;
        }
        const protobuf = (0, utils_1.getProtobufForMessage)(messageId);
        if (!protobuf) {
            debug('No route available for GC message: %s', messageId);
            return;
        }
        const data = protobuf.decode(body);
        debug('Routing GC message: %s', messageId);
        this.emit(messageId, data);
    }
}
exports.Router = Router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3JvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUVwRCxtQ0FBb0Y7QUFDcEYscUVBQXNGO0FBT3RGLE1BQWEsTUFBTyxTQUFTLDRCQUF5RDtJQUNsRixLQUFLLENBQUMsU0FBaUIsRUFBRSxJQUFZO1FBQ2pDLG9EQUFvRDtRQUNwRCwrRkFBK0Y7UUFDL0YsSUFBSSxDQUFDLENBQUMsU0FBUyxJQUFJLCtCQUFXLENBQUMsRUFBRSxDQUFDO1lBQzlCLEtBQUssQ0FBQyxpREFBaUQsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNwRSxPQUFPO1FBQ1gsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLElBQUEsNkJBQXFCLEVBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ1osS0FBSyxDQUFDLHVDQUF1QyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzFELE9BQU87UUFDWCxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUEyQixFQUFFLElBQVcsQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDSjtBQWpCRCx3QkFpQkMifQ==