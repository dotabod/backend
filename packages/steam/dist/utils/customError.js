export default class CustomError extends Error {
    constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, CustomError);
        this.name = 'CustomError';
    }
}
//# sourceMappingURL=customError.js.map