import {
  forwardRef,
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useViewTransitionState,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// View Transitions, via React Router's native data-router integration.
//
// The router owns navigation and rendering; when a navigation opts in with
// `viewTransition`, it wraps its own DOM commit in document.startViewTransition
// (flushSync inside), skips an in-flight transition if a new navigation starts
// (rapid clicks never overlap), and replays the same transition on browser
// back/forward for history entries that used one. Browsers without the API
// simply navigate. This module only decides *when* to opt in:
//
//   • never under Reduce Motion (no snapshot work at all, not just no animation)
//   • only for navigations between related views — primary nav, list → detail,
//     sibling sub-views — via TransitionLink / useTransitionNavigate. Filter
//     and query-string changes use plain navigation.
//
// The page region is named `px-page` in AppShell; everything else (sidebar,
// toolbar chrome) is part of the root snapshot, whose animation is disabled
// in base.css so chrome stays perfectly still.
// ─────────────────────────────────────────────────────────────────────────────

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia?.(REDUCED);
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}
const getReduced = () => Boolean(window.matchMedia?.(REDUCED).matches);

/** Live Reduce Motion preference. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

export const supportsViewTransitions = () =>
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown })
    .startViewTransition === "function";

/** Navigate with a view transition when appropriate. */
export function useTransitionNavigate() {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") return navigate(to);
      return navigate(to, { viewTransition: !reduced, ...options });
    },
    [navigate, reduced],
  );
}

/** Link that opts into a view transition (unless Reduce Motion is on). */
export const TransitionLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function TransitionLink(props, ref) {
    const reduced = usePrefersReducedMotion();
    return <Link ref={ref} viewTransition={!reduced} {...props} />;
  },
);

export const TransitionNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function TransitionNavLink(props, ref) {
    const reduced = usePrefersReducedMotion();
    return <NavLink ref={ref} viewTransition={!reduced} {...props} />;
  },
);

/**
 * Shared-element naming for the *source* side of a transition (a list row).
 * Returns a style that names the element only while a view transition to
 * `to` is in progress, so of all the rows on screen exactly one carries the
 * name — names must be unique in a snapshot.
 */
export function useSharedElement(
  name: string,
  to: To,
): CSSProperties | undefined {
  const active = useViewTransitionState(to);
  return active ? { viewTransitionName: name } : undefined;
}

/** Destination side: the detail view's element always carries the name. */
export const sharedName = (name: string): CSSProperties => ({
  viewTransitionName: name,
});

/** Stable, CSS-ident-safe transition name for an entity. */
export const vtName = (kind: string, id: string | number) =>
  `${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
