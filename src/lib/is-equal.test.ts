import isEqual from "./is-equal";

describe("isEqual", () => {
  test("compares primitives, with NaN equal to itself", () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual("a", "a")).toBe(true);
    expect(isEqual(NaN, NaN)).toBe(true);
    expect(isEqual(0, -0)).toBe(true);
    expect(isEqual(1, "1")).toBe(false);
    expect(isEqual(null, undefined)).toBe(false);
    expect(isEqual(null, {})).toBe(false);
  });

  test("compares nested arrays and plain objects by value", () => {
    const comment = {
      cid: "Qm1",
      edits: [{ spoiler: true, flairs: [{ text: "a" }] }],
      extra: undefined,
    };
    expect(isEqual(comment, structuredClone(comment))).toBe(true);
    expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(isEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
    expect(isEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  test("compares dates, regexps, typed arrays, maps and sets", () => {
    expect(isEqual(new Date(1), new Date(1))).toBe(true);
    expect(isEqual(new Date(1), new Date(2))).toBe(false);
    expect(isEqual(/a/g, /a/g)).toBe(true);
    expect(isEqual(/a/g, /a/i)).toBe(false);
    expect(isEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(isEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(isEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
    expect(isEqual(new Map([["a", { b: 1 }]]), new Map([["a", { b: 1 }]]))).toBe(true);
    expect(isEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(isEqual(new Set([1, "a"]), new Set(["a", 1]))).toBe(true);
    expect(isEqual(new Set([1]), new Set([2]))).toBe(false);
  });

  test("compares Map keys and Set members deeply, in any order", () => {
    expect(isEqual(new Map([[{ id: 1 }, "a"]]), new Map([[{ id: 1 }, "a"]]))).toBe(true);
    expect(isEqual(new Map([[{ id: 1 }, "a"]]), new Map([[{ id: 2 }, "a"]]))).toBe(false);
    expect(isEqual(new Set([{ id: 1 }, { id: 2 }]), new Set([{ id: 2 }, { id: 1 }]))).toBe(true);
    expect(isEqual(new Set([{ id: 1 }]), new Set([{ id: 2 }]))).toBe(false);
    // Each member needs its own match.
    expect(isEqual(new Set([{ id: 1 }, { id: 1 }]), new Set([{ id: 1 }, { id: 2 }]))).toBe(false);
  });

  test("tells apart objects built by different constructors", () => {
    class Point {
      constructor(public x: number) {}
    }
    expect(isEqual(new Point(1), new Point(1))).toBe(true);
    expect(isEqual(new Point(1), { x: 1 })).toBe(false);
  });

  test("handles circular structures", () => {
    const a: any = { name: "a" };
    a.self = a;
    const b: any = { name: "a" };
    b.self = b;
    expect(isEqual(a, b)).toBe(true);
    b.name = "b";
    expect(isEqual(a, b)).toBe(false);
  });

  test("tells apart circular structures of different lengths", () => {
    const a: any = {};
    a.next = a;
    const b1: any = {};
    const b2: any = { next: b1 };
    b1.next = b2;
    expect(isEqual(a, b1)).toBe(false);
    expect(isEqual(b1, a)).toBe(false);
  });

  test("compares array holes as undefined", () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [, 1];
    expect(isEqual(sparse, [2, 1])).toBe(false);
    expect(isEqual([2, 1], sparse)).toBe(false);
    expect(isEqual(sparse, [undefined, 1])).toBe(true);
  });
});
