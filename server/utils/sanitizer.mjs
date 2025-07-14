import { escape } from "html-escaper";

/**
 * Recursively sanitize data to prevent injection or XSS.
 * Avoids circular references using WeakSet.
 */
export function sanitizeData(data, seen = new WeakSet()) {
  if (typeof data === "string") {
    return escape(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen));
  }

  if (data && typeof data === "object") {
    if (seen.has(data)) {
      return "[Circular]"; // or return null, or skip it
    }
    seen.add(data);

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeData(value, seen);
    }
    return sanitized;
  }

  // return as-is for numbers, booleans, null, undefined
  return data;
}
