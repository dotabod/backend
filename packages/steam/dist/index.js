import 'newrelic';
import { Server } from 'socket.io';
import Dota from './steam.js';
import { logger } from './utils/logger.js';
let hasDotabodSocket = false;
let isConnectedToSteam = false;
const io = new Server(5035);
const dota = Dota.getInstance();
dota.dota2.on('ready', () => {
    logger.info('[SERVER] Connected to dota game coordinator');
    isConnectedToSteam = true;
});
io.on('connection', (socket) => {
    // dota node app just connected
    // make it join our room
    console.log('Found a connection!');
    try {
        void socket.join('steam');
    }
    catch (e) {
        console.log('Could not join steam socket');
        return;
    }
    hasDotabodSocket = true;
    socket.on('disconnect', () => {
        console.log('disconnect');
        console.log('We lost the server! Respond to all messages with "server offline"');
        hasDotabodSocket = false;
    });
    socket.on('getCards', async function (accountIds, refetchCards, callback) {
        if (!isConnectedToSteam)
            return;
        try {
            callback(null, await dota.getCards(accountIds, refetchCards));
        }
        catch (e) {
            callback(e.message, null);
        }
    });
    socket.on('getCard', async function (accountId, callback) {
        if (!isConnectedToSteam)
            return;
        try {
            callback(null, await dota.getCard(accountId));
        }
        catch (e) {
            callback(e.message, null);
        }
    });
    socket.on('getUserSteamServer', async function (steam32Id, callback) {
        if (!isConnectedToSteam)
            return;
        try {
            callback(null, await dota.getUserSteamServer(steam32Id));
        }
        catch (e) {
            callback(e.message, null);
        }
    });
    socket.on('getRealTimeStats', async function (data, callback) {
        if (!isConnectedToSteam)
            return;
        try {
            callback(null, await dota.GetRealTimeStats(data));
        }
        catch (e) {
            callback(e.message, null);
        }
    });
});
export default io;
//# sourceMappingURL=index.js.map