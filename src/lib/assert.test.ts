import assert from "./assert";

describe("assert", () => {
  test("passes truthy values", () => {
    expect(() => assert(1, "unused")).not.toThrow();
    expect(() => assert("value")).not.toThrow();
  });

  test("throws an AssertionError with the message for falsy values", () => {
    for (const value of [false, 0, "", null, undefined]) {
      let error: any;
      try {
        assert(value, "value is required");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("value is required");
      expect(error.name).toBe("AssertionError");
      expect(error.code).toBe("ERR_ASSERTION");
    }
  });

  test("throws a given Error as is", () => {
    const error = new TypeError("bad type");
    expect(() => assert(false, error)).toThrow(error);
  });
});
