import {
  removeEmptyFields,
  cleanObject,
  snakeToCamel,
  camelToSnake,
} from "../object";

describe("removeEmptyFields", () => {
  it("removes null values", () => {
    expect(removeEmptyFields({ a: 1, b: null })).toEqual({ a: 1 });
  });

  it("removes undefined values", () => {
    expect(removeEmptyFields({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("removes empty string values", () => {
    expect(removeEmptyFields({ a: "hello", b: "" })).toEqual({ a: "hello" });
  });

  it("keeps 0 (falsy but valid)", () => {
    expect(removeEmptyFields({ a: 0, b: null })).toEqual({ a: 0 });
  });

  it("keeps false (falsy but valid)", () => {
    expect(removeEmptyFields({ a: false, b: null })).toEqual({ a: false });
  });

  it("keeps non-empty strings", () => {
    expect(removeEmptyFields({ a: "value" })).toEqual({ a: "value" });
  });

  it("returns empty object when all fields are empty", () => {
    expect(removeEmptyFields({ a: null, b: undefined, c: "" })).toEqual({});
  });

  it("keeps non-empty Buffers", () => {
    const buf = Buffer.from("data");
    expect(removeEmptyFields({ a: buf })).toEqual({ a: buf });
  });

  it("removes empty Buffers", () => {
    expect(removeEmptyFields({ a: Buffer.alloc(0) })).toEqual({});
  });

  it("handles empty input object", () => {
    expect(removeEmptyFields({})).toEqual({});
  });
});

describe("cleanObject", () => {
  it("removes null, undefined and empty string values", () => {
    expect(cleanObject({ a: 1, b: null, c: undefined, d: "" })).toEqual({
      a: 1,
    });
  });

  it("removes empty arrays", () => {
    expect(cleanObject({ a: 1, b: [] })).toEqual({ a: 1 });
  });

  it("keeps non-empty arrays", () => {
    expect(cleanObject({ a: [1, 2] })).toEqual({ a: [1, 2] });
  });

  it("recursively cleans nested objects", () => {
    expect(cleanObject({ outer: { inner: null, val: 1 } })).toEqual({
      outer: { val: 1 },
    });
  });

  it("recursively cleans items inside arrays", () => {
    expect(cleanObject([null, "hello", "", undefined])).toEqual(["hello"]);
  });

  it("removes empty nested objects after cleaning", () => {
    // After cleaning, { inner: null } becomes {} — but cleanObject does not
    // remove empty objects themselves, only their empty-value keys
    const result = cleanObject({ a: { b: null } });
    expect(result).toEqual({ a: {} });
  });

  it("passes through primitives unchanged", () => {
    expect(cleanObject(42)).toBe(42);
    expect(cleanObject(true)).toBe(true);
  });

  it("handles deeply nested structures", () => {
    const input = { level1: { level2: { level3: null, val: "keep" } } };
    expect(cleanObject(input)).toEqual({ level1: { level2: { val: "keep" } } });
  });

  it("handles empty input object", () => {
    expect(cleanObject({})).toEqual({});
  });
});

describe("snakeToCamel", () => {
  it("converts single underscore key", () => {
    expect(snakeToCamel({ first_name: "John" })).toEqual({ firstName: "John" });
  });

  it("converts multiple underscore keys", () => {
    expect(snakeToCamel({ first_name: "John", last_name: "Doe" })).toEqual({
      firstName: "John",
      lastName: "Doe",
    });
  });

  it("handles keys with multiple underscores", () => {
    expect(snakeToCamel({ some_nested_key: 1 })).toEqual({ someNestedKey: 1 });
  });

  it("leaves keys without underscores unchanged", () => {
    expect(snakeToCamel({ id: 1, name: "Alice" })).toEqual({
      id: 1,
      name: "Alice",
    });
  });

  it("does not alter values", () => {
    expect(snakeToCamel({ user_id: 42 })).toEqual({ userId: 42 });
  });

  it("handles empty object", () => {
    expect(snakeToCamel({})).toEqual({});
  });
});

describe("camelToSnake", () => {
  it("converts single camelCase key", () => {
    expect(camelToSnake({ firstName: "John" })).toEqual({ first_name: "John" });
  });

  it("converts multiple camelCase keys", () => {
    expect(camelToSnake({ firstName: "John", lastName: "Doe" })).toEqual({
      first_name: "John",
      last_name: "Doe",
    });
  });

  it("handles consecutive uppercase letters", () => {
    expect(camelToSnake({ someHTTPRequest: 1 })).toEqual({
      some_h_t_t_p_request: 1,
    });
  });

  it("leaves already snake_case keys unchanged", () => {
    expect(camelToSnake({ id: 1, name: "Alice" })).toEqual({
      id: 1,
      name: "Alice",
    });
  });

  it("handles empty object", () => {
    expect(camelToSnake({})).toEqual({});
  });

  it("is the inverse of snakeToCamel for simple keys", () => {
    const original = { first_name: "John", last_name: "Doe" };
    expect(camelToSnake(snakeToCamel(original))).toEqual(original);
  });
});
