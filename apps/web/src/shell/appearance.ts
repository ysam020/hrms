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

const isDark = (a: Appearance) =>
  a === "dark" || (a === "system" && systemDark());

// Where the last pointer press landed, so a theme switch can grow out of
// the menu item that triggered it (keyboard choices start at top centre).
let lastPress: { x: number; y: number } | null = null;
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    (e) => (lastPress = { x: e.clientX, y: e.clientY }),
    { capture: true, passive: true },
  );

/**
 * Applies an appearance with a circular reveal (View Transitions): the new
 * theme grows out of the press point over the old one. Skipped when the
 * colours don't actually change, under Reduce Motion, and where the API is
 * missing — then it just applies. CSS lives in design/base.css.
 */
function switchAppearance(
  next: Appearance,
  prev: Appearance,
  // Runs with the change. Callers update React state here: anything that
  // applies the theme before the browser has captured the old snapshot
  // (an effect running on the state change) would leave nothing to reveal.
  onApplied: () => void,
) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced || isDark(next) === isDark(prev)) {
    applyAppearance(next);
    onApplied();
    return;
  }
  const root = document.documentElement;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const { x, y } = lastPress ?? { x: w / 2, y: 0 };
  lastPress = null;
  root.style.setProperty("--px-theme-x", `${x}px`);
  root.style.setProperty("--px-theme-y", `${y}px`);
  // Radius reaching the farthest corner, so the circle covers everything.
  root.style.setProperty(
    "--px-theme-r",
    `${Math.hypot(Math.max(x, w - x), Math.max(y, h - y))}px`,
  );
  root.setAttribute("data-px-theme-switch", "");
  const t = doc.startViewTransition(() => {
    applyAppearance(next);
    onApplied();
  });
  t.finished.finally(() => {
    root.removeAttribute("data-px-theme-switch");
    ["--px-theme-x", "--px-theme-y", "--px-theme-r"].forEach((v) =>
      root.style.removeProperty(v),
    );
  });
}

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
    const prev = read();
    try {
      localStorage.setItem(KEY, a);
    } catch {
      /* ignore */
    }
    // State changes inside the transition, after the old snapshot; the
    // effect re-applying it on that change is then a no-op.
    switchAppearance(a, prev, () => set(a));
  }, []);
  return { appearance, setAppearance };
}
