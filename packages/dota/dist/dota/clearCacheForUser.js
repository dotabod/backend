import { getAuthProvider } from '../twitch/lib/getAuthProvider.js';
import { logger } from '../utils/logger.js';
import { deleteRedisData } from './GSIHandler.js';
import { gsiHandlers, twitchIdToToken } from './lib/consts.js';
// This will hold the last POST request timestamp for each token
export const tokenLastPostTimestamps = new Map();
export const TOKEN_TIMEOUT = 10 * 60 * 1000; // 10 minutes
// Function to check for inactive tokens and delete the corresponding gsiHandler
export async function checkForInactiveTokens() {
    const now = Date.now();
    const timeoutMillis = TOKEN_TIMEOUT;
    for (const [token, timestamp] of tokenLastPostTimestamps.entries()) {
        if (now - timestamp > timeoutMillis) {
            await clearCacheForUser(gsiHandlers.get(token)?.client);
        }
    }
}
// three types of in-memory cache exists
export async function clearCacheForUser(client) {
    if (!client)
        return false;
    // mark the client as disabled while we cleanup everything
    // just so new items won't get added while we do this
    gsiHandlers.get(client.token)?.disable();
    const accountId = client.Account?.providerAccountId ?? '';
    twitchIdToToken.delete(accountId);
    const authProvider = getAuthProvider();
    authProvider.removeUser(accountId);
    await deleteRedisData(client);
    logger.info('Cleared cache for user before', {
        size: gsiHandlers.size,
        accountId,
        token: client.token,
    });
    gsiHandlers.delete(client.token);
    tokenLastPostTimestamps.delete(client.token);
    logger.info('Cleared cache for user after', {
        size: gsiHandlers.size,
        accountId,
        token: client.token,
    });
    return true;
}
//# sourceMappingURL=clearCacheForUser.js.map