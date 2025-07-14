export const convertToSnakeCase = (obj) => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertToSnakeCase(item));
  }

  return Object.keys(obj).reduce((acc, key) => {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`
    );

    // Handle nested objects and arrays recursively
    const value = convertToSnakeCase(obj[key]);

    acc[snakeKey] = value;
    return acc;
  }, {});
};
