// Removes fields that are null, undefined, or empty string (shallow)
export function removeEmptyFields(
  data: Record<string, any>,
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => {
      if (Buffer.isBuffer(value)) return value.length > 0;
      return value !== null && value !== undefined && value !== "";
    }),
  );
}

// Recursively removes empty strings, empty arrays, null, and undefined from an object
export function cleanObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj
      .map(cleanObject)
      .filter((item) => item !== null && item !== undefined && item !== "");
  }
  if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).reduce(
      (acc: Record<string, any>, [key, value]) => {
        if (Array.isArray(value) && value.length === 0) return acc;
        if (typeof value === "string" && value.trim() === "") return acc;
        if (value === null || value === undefined) return acc;
        acc[key] = cleanObject(value);
        return acc;
      },
      {},
    );
  }
  return obj;
}

// Converts all keys of a plain object from snake_case to camelCase (shallow)
export function snakeToCamel(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      value,
    ]),
  );
}

// Converts all keys of a plain object from camelCase to snake_case (shallow)
export function camelToSnake(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key
        .replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`)
        // A trailing digit needs its own underscore boundary too (e.g.
        // "addressLine1" -> "address_line1" from the rule above, but the
        // real field name is "address_line_1") — without this, any
        // camelCase key ending in a digit produces a key that doesn't match
        // its snake_case counterpart and silently fails to merge.
        .replace(/([a-zA-Z])(\d)/g, "$1_$2"),
      value,
    ]),
  );
}
