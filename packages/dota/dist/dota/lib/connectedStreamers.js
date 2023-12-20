import { gsiHandlers, twitchIdToToken } from './consts.js';
export function getTokenFromTwitchId(twitchId) {
    if (!twitchId)
        return null;
    if (!twitchIdToToken.has(twitchId))
        return null;
    const token = twitchIdToToken.get(twitchId);
    if (!token || !gsiHandlers.has(token))
        return null;
    return token;
}
export default function findUser(token) {
    if (!token || !gsiHandlers.has(token))
        return null;
    return gsiHandlers.get(token)?.client ?? null;
}
export function findUserByTwitchId(twitchId) {
    const token = getTokenFromTwitchId(twitchId);
    if (!token)
        return null;
    return gsiHandlers.get(token)?.client ?? null;
}
export function findGSIHandlerByTwitchId(twitchId) {
    const token = getTokenFromTwitchId(twitchId);
    if (!token)
        return null;
    return gsiHandlers.get(token) ?? null;
}
//# sourceMappingURL=connectedStreamers.js.map