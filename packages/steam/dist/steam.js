import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';
// @ts-expect-error no types exist
import Dota2 from 'dota2';
import retry from 'retry';
import Steam from 'steam';
// @ts-expect-error no types exist
import steamErrors from 'steam-errors';
import MongoDBSingleton from './MongoDBSingleton.js';
import CustomError from './utils/customError.js';
import { getAccountsFromMatch } from './utils/getAccountsFromMatch.js';
import { logger } from './utils/logger.js';
import { retryCustom } from './utils/retry.js';
import io from './index.js';
const MAX_CACHE_SIZE = 5000;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const isDev = process.env.NODE_ENV === 'development';
function onGCSpectateFriendGameResponse(message, callback) {
    const response = Dota2.schema.CMsgSpectateFriendGameResponse.decode(message);
    if (callback !== undefined) {
        callback(response);
    }
}
Dota2.Dota2Client.prototype.spectateFriendGame = function (friend, callback) {
    callback = callback || null;
    if (!this._gcReady) {
        logger.info("[STEAM] GC not ready, please listen for the 'ready' event.");
        return null;
    }
    // CMsgSpectateFriendGame
    const payload = new Dota2.schema.CMsgSpectateFriendGame(friend);
    this.sendToGC(Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame, payload, onGCSpectateFriendGameResponse, callback);
};
const handlers = Dota2.Dota2Client.prototype._handlers;
handlers[Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse] =
    onGCSpectateFriendGameResponse;
// Fetches data from MongoDB
const fetchDataFromMongo = async (match_id) => {
    const mongo = MongoDBSingleton;
    const db = await mongo.connect();
    try {
        return await db.collection('delayedGames').findOne({ 'match.match_id': match_id });
    }
    finally {
        await mongo.close();
    }
};
// Constructs the API URL
const getApiUrl = (steam_server_id) => {
    if (!process.env.STEAM_WEB_API)
        throw new CustomError('STEAM_WEB_API not set');
    return `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steam_server_id}`;
};
// Saves the match to MongoDB and fetches new medals if needed
const saveMatch = async ({ match_id, game, refetchCards = false, }) => {
    const mongo = MongoDBSingleton;
    const db = await mongo.connect();
    try {
        await db
            .collection('delayedGames')
            .updateOne({ 'match.match_id': match_id }, { $set: game }, { upsert: true });
        if (refetchCards) {
            const { accountIds } = await getAccountsFromMatch({
                searchMatchId: game.match.match_id,
            });
            const dota = Dota.getInstance();
            await dota.getCards(accountIds, true);
        }
    }
    finally {
        await mongo.close();
    }
};
function hasSteamData(game) {
    const hasTeams = Array.isArray(game?.teams) && game?.teams.length === 2;
    const hasPlayers = hasTeams &&
        Array.isArray(game.teams[0].players) &&
        Array.isArray(game.teams[1].players) &&
        game.teams[0].players.length === 5 &&
        game.teams[1].players.length === 5;
    // Dev should be able to test in a lobby with bot matches
    const hasAccountIds = isDev
        ? hasPlayers // dev local lobby just needs the players array
        : hasPlayers &&
            game.teams[0].players.every((player) => player.accountid) &&
            game.teams[1].players.every((player) => player.accountid);
    const hasHeroes = hasPlayers &&
        game.teams[0].players.every((player) => player.heroid) &&
        game.teams[1].players.every((player) => player.heroid);
    return { hasAccountIds, hasPlayers, hasHeroes };
}
function sortPlayersBySlot(game) {
    for (const team of game.teams) {
        team.players.sort((a, b) => a.team_slot - b.team_slot);
    }
}
class Dota {
    static instance;
    cache = new Map();
    steamClient;
    steamUser;
    dota2;
    constructor() {
        this.steamClient = new Steam.SteamClient();
        // @ts-expect-error no types exist
        this.steamUser = new Steam.SteamUser(this.steamClient);
        this.dota2 = new Dota2.Dota2Client(this.steamClient, false, false);
        const details = this.getUserDetails();
        this.loadServerList();
        this.loadSentry(details);
        this.setupClientEventHandlers(details);
        this.setupUserEventHandlers();
        this.setupDotaEventHandlers();
        // @ts-expect-error no types exist
        this.steamClient.connect();
    }
    getUserDetails() {
        const usernames = process.env.STEAM_USER?.split('|') ?? [];
        const passwords = process.env.STEAM_PASS?.split('|') ?? [];
        if (!usernames.length || !passwords.length) {
            throw new Error('STEAM_USER or STEAM_PASS not set');
        }
        return {
            account_name: usernames[0],
            password: passwords[0],
        };
    }
    loadServerList() {
        const serverPath = './src/steam/volumes/servers.json';
        if (fs.existsSync(serverPath)) {
            try {
                Steam.servers = JSON.parse(fs.readFileSync(serverPath).toString());
            }
            catch (e) {
                // Ignore
            }
        }
    }
    loadSentry(details) {
        const sentryPath = './src/steam/volumes/sentry';
        if (fs.existsSync(sentryPath)) {
            const sentry = fs.readFileSync(sentryPath);
            if (sentry.length)
                details.sha_sentryfile = sentry;
        }
    }
    setupClientEventHandlers(details) {
        this.steamClient.on('connected', () => {
            this.steamUser.logOn(details);
        });
        this.steamClient.on('logOnResponse', this.handleLogOnResponse.bind(this));
        this.steamClient.on('loggedOff', this.handleLoggedOff.bind(this));
        this.steamClient.on('error', this.handleClientError.bind(this));
        this.steamClient.on('servers', this.handleServerUpdate.bind(this));
    }
    handleLogOnResponse(logonResp) {
        // @ts-expect-error no types exist
        if (logonResp.eresult == Steam.EResult.OK) {
            logger.info('[STEAM] Logged on.');
            this.dota2.launch();
        }
        else {
            this.logSteamError(logonResp.eresult);
        }
    }
    handleLoggedOff(eresult) {
        // @ts-expect-error no types exist
        if (this.isProduction())
            this.steamClient.connect();
        logger.info('[STEAM] Logged off from Steam.', { eresult });
        this.logSteamError(eresult);
    }
    handleClientError(error) {
        logger.info('[STEAM] steam error', { error });
        if (!this.isProduction()) {
            this.exit().catch((e) => logger.error('err steam error', { e }));
        }
        // @ts-expect-error no types exist
        if (this.isProduction())
            this.steamClient.connect();
    }
    handleServerUpdate(servers) {
        fs.writeFileSync('./src/steam/volumes/servers.json', JSON.stringify(servers));
    }
    setupUserEventHandlers() {
        this.steamUser.on('updateMachineAuth', this.handleMachineAuth.bind(this));
    }
    // @ts-expect-error no types exist
    handleMachineAuth(sentry, callback) {
        const hashedSentry = crypto.createHash('sha1').update(sentry.bytes).digest();
        fs.writeFileSync('./src/steam/volumes/sentry', hashedSentry);
        logger.info('[STEAM] sentryfile saved');
        callback({ sha_file: hashedSentry });
    }
    setupDotaEventHandlers() {
        this.dota2.on('hellotimeout', this.handleHelloTimeout.bind(this));
        this.dota2.on('unready', () => logger.info('[STEAM] disconnected from dota game coordinator'));
    }
    handleHelloTimeout() {
        this.dota2.exit();
        setTimeout(() => {
            // @ts-expect-error no types exist
            if (this.steamClient.loggedOn)
                this.dota2.launch();
        }, 30000);
        logger.info('[STEAM] hello time out!');
    }
    // @ts-expect-error no types exist
    logSteamError(eresult) {
        try {
            // @ts-expect-error no types exist
            steamErrors(eresult, (err, errorObject) => {
                logger.info('[STEAM]', { errorObject, err });
            });
        }
        catch (e) {
            // Ignore
        }
    }
    isProduction() {
        return process.env.NODE_ENV === 'production';
    }
    getUserSteamServer = (steam32Id) => {
        const steam_id = this.dota2.ToSteamID(Number(steam32Id));
        // Set up the retry operation
        const operation = retry.operation({
            retries: 35,
            factor: 1.1,
            minTimeout: 5000, // Minimum retry timeout (1 second)
            maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
        });
        return new Promise((resolve, reject) => {
            operation.attempt(() => {
                this.dota2.spectateFriendGame({ steam_id }, (response, err) => {
                    const theID = response?.server_steamid?.toString();
                    const shouldRetry = !theID ? new Error('No ID yet, will keep trying.') : undefined;
                    if (operation.retry(shouldRetry))
                        return;
                    if (theID)
                        resolve(theID);
                    else
                        reject('No spectator match found');
                });
            });
        });
    };
    fetchAndUpdateCard = async (accountId) => {
        let fetchedCard = {
            rank_tier: -10,
            leaderboard_rank: 0,
        };
        if (accountId) {
            fetchedCard = await retryCustom(() => this.getCard(accountId)).catch(() => fetchedCard);
        }
        const card = {
            ...fetchedCard,
            account_id: accountId,
            createdAt: new Date(),
            rank_tier: fetchedCard?.rank_tier ?? 0,
            leaderboard_rank: fetchedCard?.leaderboard_rank ?? 0,
        };
        if (!accountId)
            return card;
        if (fetchedCard?.rank_tier !== -10) {
            const mongo = MongoDBSingleton;
            const db = await mongo.connect();
            try {
                await db
                    .collection('cards')
                    .updateOne({ account_id: accountId }, { $set: card }, { upsert: true });
            }
            finally {
                await mongo.close();
            }
        }
        return card;
    };
    async fetchProfileCard(account) {
        return new Promise((resolve, reject) => {
            // @ts-expect-error no types exist for `loggedOn`
            if (!this.dota2._gcReady || !this.steamClient.loggedOn)
                reject(new CustomError('Error getting medal'));
            else {
                this.dota2.requestProfileCard(account, (err, card) => {
                    if (err)
                        reject(err);
                    resolve(card);
                });
            }
        });
    }
    promiseTimeout = (promise, ms, reason) => new Promise((resolve, reject) => {
        let timeoutCleared = false;
        const timeoutId = setTimeout(() => {
            timeoutCleared = true;
            reject(new CustomError(reason));
        }, ms);
        promise
            .then((result) => {
            if (!timeoutCleared) {
                clearTimeout(timeoutId);
                resolve(result);
            }
        })
            .catch((err) => {
            if (!timeoutCleared) {
                clearTimeout(timeoutId);
                reject(err);
            }
        });
    });
    async getCard(account) {
        const now = Date.now();
        const cacheEntry = this.cache.get(account);
        if (cacheEntry && now - cacheEntry.timestamp < CACHE_TTL) {
            return cacheEntry.card;
        }
        // If not cached or cache is stale, fetch the profile card
        const card = await this.promiseTimeout(this.fetchProfileCard(account), 1000, 'Error getting medal');
        this.evictOldCacheEntries(); // Evict entries based on time
        this.cache.set(account, {
            timestamp: now,
            card: card,
        });
        this.evictExtraCacheEntries(); // Evict extra entries if cache size exceeds MAX_CACHE_SIZE
        return card;
    }
    evictOldCacheEntries() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }
    evictExtraCacheEntries() {
        while (this.cache.size > MAX_CACHE_SIZE) {
            const oldestKey = [...this.cache.entries()].reduce((oldest, [key, entry]) => {
                if (!oldest)
                    return key;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return entry.timestamp < this.cache.get(oldest).timestamp ? key : oldest;
            }, null);
            if (oldestKey !== null) {
                this.cache.delete(oldestKey);
            }
        }
    }
    async getCards(accounts, refetchCards = false) {
        const mongo = MongoDBSingleton;
        const db = await mongo.connect();
        try {
            const cardsFromDb = await db
                .collection('cards')
                .find({ account_id: { $in: accounts.filter((a) => !!a) } })
                .sort({ createdAt: -1 })
                .toArray();
            const cardsMap = new Map(cardsFromDb.map((card) => [card.account_id, card]));
            const promises = accounts.map(async (accountId) => {
                const existingCard = cardsMap.get(accountId);
                if (refetchCards || !existingCard || typeof existingCard.rank_tier !== 'number') {
                    return this.fetchAndUpdateCard(accountId);
                }
                return existingCard;
            });
            return Promise.all(promises);
        }
        finally {
            await mongo.close();
        }
    }
    GetRealTimeStats = async ({ match_id, refetchCards = false, steam_server_id, token, forceRefetchAll = false, }) => {
        let waitForHeros = forceRefetchAll || false;
        if (!steam_server_id) {
            throw new Error('Match not found');
        }
        const currentData = await fetchDataFromMongo(match_id);
        const { hasAccountIds, hasHeroes } = hasSteamData(currentData);
        // can early exit if we have all the data we need
        if (currentData && hasHeroes && hasAccountIds && !forceRefetchAll) {
            return currentData;
        }
        const operation = retry.operation({
            retries: 35,
            factor: 1.1,
            minTimeout: 5000, // Minimum retry timeout (1 second)
            maxTimeout: 10_000, // Maximum retry timeout (10 seconds)
        });
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            operation.attempt(async (currentAttempt) => {
                let game;
                try {
                    game = (await axios(getApiUrl(steam_server_id)))?.data;
                }
                catch (e) {
                    return operation.retry(new Error('Match not found'));
                }
                const { hasAccountIds, hasHeroes } = hasSteamData(game);
                // needs account ids
                const retryAttempt = !hasAccountIds || !game ? new Error() : undefined;
                if (operation.retry(retryAttempt))
                    return;
                // needs hero data
                const retryAttempt2 = waitForHeros && !hasHeroes ? new Error() : undefined;
                if (operation.retry(retryAttempt2))
                    return;
                // sort players by team_slot
                sortPlayersBySlot(game);
                // 2-minute delay gives "0" match id, so we use the gsi match id instead
                game.match.match_id = match_id;
                game.match.server_steam_id = steam_server_id;
                const gamePlusMore = { ...game, createdAt: new Date() };
                if (hasHeroes) {
                    await saveMatch({ match_id, game: gamePlusMore });
                    if (!forceRefetchAll) {
                        // forward the msg to dota node app
                        io.to('steam').emit('saveHeroesForMatchId', { matchId: match_id, token });
                    }
                    return resolve(gamePlusMore);
                }
                if (!waitForHeros) {
                    await saveMatch({ match_id, game: gamePlusMore, refetchCards });
                    waitForHeros = true;
                    operation.retry(new Error());
                }
                return resolve(gamePlusMore);
            });
        });
    };
    static getInstance() {
        if (!Dota.instance)
            Dota.instance = new Dota();
        return Dota.instance;
    }
    exit() {
        return new Promise((resolve) => {
            this.dota2.exit();
            logger.info('[STEAM] Manually closed dota');
            // @ts-expect-error disconnect is there
            this.steamClient.disconnect();
            logger.info('[STEAM] Manually closed steam');
            this.steamClient.removeAllListeners();
            this.dota2.removeAllListeners();
            logger.info('[STEAM] Removed all listeners from dota and steam');
            resolve(true);
        });
    }
}
export default Dota;
process
    .on('SIGTERM', () => {
    logger.info('[STEAM] Received SIGTERM');
    const dota = Dota.getInstance();
    Promise.all([dota.exit()])
        .then(() => process.exit(0))
        .catch((e) => {
        logger.info('[STEAM]', e);
    });
})
    .on('SIGINT', () => {
    logger.info('[STEAM] Received SIGINT');
    const dota = Dota.getInstance();
    Promise.all([dota.exit()])
        .then(() => process.exit(0))
        .catch((e) => {
        logger.info('[STEAM]', e);
    });
})
    .on('uncaughtException', (e) => logger.error('uncaughtException', e));
//# sourceMappingURL=steam.js.map