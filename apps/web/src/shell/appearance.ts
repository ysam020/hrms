import { useCallback, useEffect, useState } from "react";

// Light by default; Dark and Match System are explicit choices (account
// menu). Stored per browser; failures are benign.

export type Appearance = "system" | "light" | "dark";
const KEY = "px-appearance";

const read = (): Appearance => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "system" || v === "dark" ? v : "light";
  } catch {
    return "light";
  }
};

const systemDark = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-color-scheme: dark)").matches;

/**
 * The browser chrome colour (theme-color) follows the appearance; first set
 * by public/theme-init.js. The installed iOS app doesn't use it: it matches
 * its status bar to the opaque toolbar instead (src/design/tokens.css).
 */
function syncChrome(a: Appearance) {
  const dark = a === "dark" || (a === "system" && systemDark());
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--px-bg-window")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", bg || (dark ? "#141416" : "#f2f3f5"));
}

let followingSystem = false;

export function applyAppearance(a: Appearance = read()) {
  // Match System: keep the chrome in step when the OS switches while the
  // app is open (on every page, signed in or not).
  if (!followingSystem && typeof matchMedia === "function") {
    followingSystem = true;
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      () => read() === "system" && syncChrome("system"),
    );
    // A choice made in another tab (or restored there) applies here too,
    // without a reload; open appearance menus pick it up via useAppearance.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY || e.key === null) {
        applyAppearance(read());
        window.dispatchEvent(new Event(CHANGED));
      }
    });
  }
  const root = document.documentElement;
  // Hand over from public/theme-init.js's pre-paint styles to the tokens.
  root.classList.remove("dark-theme");
  root.style.removeProperty("background-color");
  root.style.removeProperty("color-scheme");
  if (a === "system") root.removeAttribute("data-appearance");
  else root.setAttribute("data-appearance", a);
  syncChrome(a);
}

const CHANGED = "px-appearance-change";

export function useAppearance() {
  const [appearance, set] = useState<Appearance>(read);
  useEffect(() => applyAppearance(appearance), [appearance]);
  // Stay in step with a change made elsewhere (another tab).
  useEffect(() => {
    const sync = () => set(read());
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  const setAppearance = useCallback((a: Appearance) => {
    try {
      localStorage.setItem(KEY, a);
    } catch {
      /* ignore */
    }
    set(a);
  }, []);
  return { appearance, setAppearance };
}
