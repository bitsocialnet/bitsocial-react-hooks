/**
 * Throws when `value` is falsy, like Node's `assert(value, message)`, without bundling Node's
 * assert and util polyfills into the apps that use these hooks.
 */
export default function assert(value: unknown, message?: string | Error): asserts value;
//# sourceMappingURL=assert.d.ts.map