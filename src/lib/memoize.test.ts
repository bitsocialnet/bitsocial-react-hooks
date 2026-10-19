import memoize from "./memoize";

describe("memoize", () => {
  test("returns the cached result for the same arguments, compared by identity", () => {
    const fn = vi.fn((a: object, b: number) => ({ a, b }));
    const memoized = memoize(fn, { max: 10 });
    const object = {};

    const first = memoized(object, 1);
    expect(memoized(object, 1)).toBe(first);
    expect(memoized({}, 1)).not.toBe(first);
    expect(memoized(object, 2)).not.toBe(first);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("keys on every argument, for functions called with a variable number of them", () => {
    const fn = vi.fn((...args: unknown[]) => args.length);
    const memoized = memoize(fn, { max: 10 });

    expect(memoized("a")).toBe(1);
    expect(memoized("a", "b")).toBe(2);
    expect(memoized("a")).toBe(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("evicts the least recently used result beyond max", () => {
    const fn = vi.fn((key: string) => ({ key }));
    const memoized = memoize(fn, { max: 2 });

    const a = memoized("a");
    memoized("b");
    memoized("a"); // a is now the most recently used
    memoized("c"); // evicts b
    expect(memoized("a")).toBe(a);
    expect(fn).toHaveBeenCalledTimes(3);
    memoized("b");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test("does not cache errors", () => {
    let calls = 0;
    const memoized = memoize(
      () => {
        calls++;
        if (calls === 1) {
          throw Error("first call fails");
        }
        return calls;
      },
      { max: 10 },
    );

    expect(() => memoized()).toThrow("first call fails");
    expect(memoized()).toBe(2);
    expect(memoized()).toBe(2);
  });
});
