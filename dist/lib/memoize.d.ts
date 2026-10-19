/**
 * Caches a function's results by its arguments, compared by identity, keeping the `max` most
 * recently used. Errors are not cached. It covers what these hooks used memoizee for, without
 * bundling memoizee and es5-ext into the apps that use them.
 */
export default function memoize<Args extends unknown[], Result>(fn: (...args: Args) => Result, { max }: {
    max: number;
}): (...args: Args) => Result;
//# sourceMappingURL=memoize.d.ts.map