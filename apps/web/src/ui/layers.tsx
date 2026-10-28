import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

// Overlay plumbing shared by Dialog, Sheet, Popover, and Menu.
//
//  • Portal         — renders into #px-layers so overlays escape overflow and
//                     stacking contexts of the page.
//  • useScrollLock  — reference-counted, so nested dialogs/sheets don't unlock
//                     the page when the inner one closes.
//  • useFocusTrap   — moves focus in on open, cycles Tab inside, and restores
//                     focus to the opener on close (also after an exit anim).
//  • useDismissStack— Escape closes only the topmost open layer.

export function Portal({ children }: { children: ReactNode }) {
  const host =
    (typeof document !== "undefined" && document.getElementById("px-layers")) ||
    (typeof document !== "undefined" ? document.body : null);
  return host ? createPortal(children, host) : null;
}

let lockCount = 0;
let savedOverflow = "";
let savedPadding = "";

export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const body = document.body;
    if (lockCount === 0) {
      savedOverflow = body.style.overflow;
      savedPadding = body.style.paddingRight;
      const gap = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (gap > 0) body.style.paddingRight = `${gap}px`;
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        body.style.overflow = savedOverflow;
        body.style.paddingRight = savedPadding;
      }
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.offsetParent !== null,
  );
}

/**
 * Trap Tab focus inside `ref` while active. `initialFocus` (a ref) wins;
 * otherwise the first `[data-autofocus]`, else the first focusable, else the
 * container itself.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;

    const target =
      initialFocus?.current ||
      root.querySelector<HTMLElement>("[data-autofocus]") ||
      focusables(root)[0] ||
      root;
    // Defer one frame so the entering element is laid out and focusable.
    const raf = requestAnimationFrame(() =>
      target.focus({ preventScroll: true }),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root.contains(document.activeElement)) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      // Restore to the opener if it's still in the document.
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

type Dismiss = { id: number; onDismiss: () => void };
const stack: Dismiss[] = [];
let nextId = 1;

function onGlobalKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  const top = stack[stack.length - 1];
  e.preventDefault();
  e.stopPropagation();
  top.onDismiss();
}

/** Register a layer; Escape dismisses only the most recently opened one. */
export function useDismissStack(active: boolean, onDismiss: () => void) {
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const entry: Dismiss = { id: nextId++, onDismiss: () => cb.current() };
    if (stack.length === 0)
      document.addEventListener("keydown", onGlobalKey, true);
    stack.push(entry);
    return () => {
      const i = stack.findIndex((s) => s.id === entry.id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0)
        document.removeEventListener("keydown", onGlobalKey, true);
    };
  }, [active]);
}

/** Whether any layer is open (used to pause global shortcuts). */
export const hasOpenLayer = () => stack.length > 0;
