import "@testing-library/jest-dom/vitest";

// jsdom lacks these browser APIs used by the shell and motion layer.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
if (!("IntersectionObserver" in window)) {
  (window as any).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
}

// Node 22+ defines an experimental, unusable localStorage global that shadows
// jsdom's; give tests a working in-memory one.
if (typeof localStorage === "undefined" || !localStorage?.clear) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage,
  });
}
