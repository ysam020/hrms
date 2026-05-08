import "@testing-library/jest-dom";

// Node.js 22+ defines localStorage as an experimental undefined global, which
// shadows jsdom's implementation. Force-set a working mock via defineProperty.
if (typeof localStorage === "undefined") {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (n: number) => Object.keys(store)[n] ?? null,
    } as Storage,
    writable: true,
    configurable: true,
  });
}
