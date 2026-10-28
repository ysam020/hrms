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

export function applyAppearance(a: Appearance = read()) {
  const root = document.documentElement;
  // Hand over from public/theme-init.js's pre-paint styles to the tokens.
  root.classList.remove("dark-theme");
  root.style.removeProperty("background-color");
  root.style.removeProperty("color-scheme");
  if (a === "system") root.removeAttribute("data-appearance");
  else root.setAttribute("data-appearance", a);
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
