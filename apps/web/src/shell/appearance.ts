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
 * Browser and status-bar colours follow the appearance (index.html; first
 * set by public/theme-init.js). iOS reads the status-bar style when the
 * installed app launches, so a change there shows from the next launch.
 */
function syncChrome(a: Appearance) {
  const dark = a === "dark" || (a === "system" && systemDark());
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--px-bg-window")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", bg || (dark ? "#141416" : "#f2f3f5"));
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", dark ? "black" : "default");
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

export function useAppearance() {
  const [appearance, set] = useState<Appearance>(read);
  useEffect(() => applyAppearance(appearance), [appearance]);
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
