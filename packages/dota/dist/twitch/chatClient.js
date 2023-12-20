import { io } from 'socket.io-client';
import { isDev } from '../dota/lib/consts.js';
// Our docker chat forwarder instance
export const twitchChat = io('ws://twitch-chat:5005');
export const chatClient = {
    join: (channel) => {
        twitchChat.emit('join', channel);
    },
    part: (channel) => {
        twitchChat.emit('part', channel);
    },
    say: (channel, text) => {
        if (isDev)
            console.log({ channel, text });
        twitchChat.emit('say', channel, text);
    },
};
//# sourceMappingURL=chatClient.js.map