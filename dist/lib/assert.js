/**
 * Throws when `value` is falsy, like Node's `assert(value, message)`, without bundling Node's
 * assert and util polyfills into the apps that use these hooks.
 */
export default function assert(value, message) {
    if (value) {
        return;
    }
    if (message instanceof Error) {
        throw message;
    }
    const error = new Error(message !== null && message !== void 0 ? message : "The expression evaluated to a falsy value");
    error.name = "AssertionError";
    error.code = "ERR_ASSERTION";
    throw error;
}
//# sourceMappingURL=assert.js.map