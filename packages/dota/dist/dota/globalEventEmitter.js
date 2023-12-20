import { EventEmitter } from 'events';
export const events = new EventEmitter();
// I dont think we need 20, but just in case. Default is 11
events.setMaxListeners(20);
function emitAll(prefix, obj, token) {
    Object.keys(obj).forEach((key) => {
        events.emit('prefix + key', obj[key], token);
    });
}
function recursiveEmit(prefix, changed, body, token) {
    Object.keys(changed).forEach((key) => {
        if (typeof changed[key] === 'object') {
            if (body[key] != null) {
                // safety check
                recursiveEmit(`${prefix + key}:`, changed[key], body[key], token);
            }
        }
        else {
            // Got a key
            if (body[key] != null) {
                if (typeof body[key] === 'object') {
                    // Edge case on added:item/ability:x where added shows true at the top level
                    // and doesn't contain each of the child keys
                    emitAll(`${prefix + key}:`, body[key], token);
                }
                else {
                    events.emit(prefix + key, body[key], token);
                }
            }
        }
    });
}
export function processChanges(section) {
    return function handle(req, res, next) {
        if (req.body[section]) {
            const token = req.body.auth.token;
            recursiveEmit('', req.body[section], req.body, token);
        }
        next();
    };
}
export function newData(req, res) {
    const token = req.body.auth.token;
    events.emit('newdata', req.body, token);
    res.status(200).json({ status: 'ok' });
}
//# sourceMappingURL=globalEventEmitter.js.map