/**
 * Caches a function's results by its arguments, compared by identity, keeping the `max` most
 * recently used. Errors are not cached. It covers what these hooks used memoizee for, without
 * bundling memoizee and es5-ext into the apps that use them.
 */
export default function memoize(fn, { max }) {
    // Most recently used first.
    const entries = [];
    return (...args) => {
        const index = entries.findIndex((entry) => entry.args.length === args.length && entry.args.every((arg, i) => arg === args[i]));
        if (index !== -1) {
            const [entry] = entries.splice(index, 1);
            entries.unshift(entry);
            return entry.result;
        }
        const result = fn(...args);
        entries.unshift({ args, result });
        if (entries.length > max) {
            entries.pop();
        }
        return result;
    };
}
//# sourceMappingURL=memoize.js.map