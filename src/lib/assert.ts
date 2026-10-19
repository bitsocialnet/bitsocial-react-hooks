/**
 * Throws when `value` is falsy, like Node's `assert(value, message)`, without bundling Node's
 * assert and util polyfills into the apps that use these hooks.
 */
export default function assert(value: unknown, message?: string | Error): asserts value {
  if (value) {
    return;
  }
  if (message instanceof Error) {
    throw message;
  }
  const error: Error & { code?: string } = new Error(
    message ?? "The expression evaluated to a falsy value",
  );
  error.name = "AssertionError";
  error.code = "ERR_ASSERTION";
  throw error;
}
