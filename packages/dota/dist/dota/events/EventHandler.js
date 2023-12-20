import { events } from '../globalEventEmitter.js';
import { gsiHandlers } from '../lib/consts.js';
class EventHandler {
    registerEvent = (eventName, options) => {
        events.on(eventName, (data, token) => {
            if (!gsiHandlers.has(token))
                return;
            const client = gsiHandlers.get(token);
            if (!client)
                return;
            // if we disabled the backend processing from somewhere else
            // we shouldn't process events
            if (client.disabled)
                return;
            // if we r offline don't process events
            if (!client.client.stream_online)
                return;
            // dont send events if someone is sharing a computer for another steam account
            if (client.client.multiAccount)
                return;
            // check if options.handler is a promise first
            options.handler(client, data)?.catch((err) => {
                console.error('Error handling event:', { token, eventName, err });
            });
        });
    };
}
const eventHandler = new EventHandler();
export default eventHandler;
//# sourceMappingURL=EventHandler.js.map