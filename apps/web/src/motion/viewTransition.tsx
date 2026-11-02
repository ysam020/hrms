import {
  forwardRef,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  Link,
  NavLink,
  UNSAFE_ViewTransitionContext,
  matchPath,
  useNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from "react-router-dom";
import { getScope } from "@next/offline/state";

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

// ─────────────────────────────────────────────────────────────────────────────
// Shared elements.
//
// An entity shown on two screens (a person's avatar and name, a job's title,
// an approval row) keeps its identity across the navigation: both screens give
// the matching element the same `view-transition-name`, and the browser morphs
// it from its old position and size to its new one. Names are per *part* of an
// entity (`person-avatar-<id>`, `person-title-<id>`) so the avatar and the
// name travel independently, and each part carries a `view-transition-class`
// (`px-vt-avatar`, `px-vt-title`, …) that base.css styles per part.
//
// Names must be unique in a snapshot, so list rows name their parts only while
// a transition to/from their own detail screen runs (`useTransitionWith`).
// A detail screen shows one entity and names its parts whenever they render.
// ─────────────────────────────────────────────────────────────────────────────

/** Parts that morph between views, each styled by its own class in base.css. */
export type SharedPart = "avatar" | "title" | "badge" | "row" | "heading";

/** Stable, CSS-ident-safe transition name for an entity. */
export const vtName = (kind: string, id: string | number) =>
  `${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

/**
 * Style naming one part of an entity (or nothing, when `on` is false).
 * `kind` + `id` must be the same on both screens — use the value the
 * destination route is keyed by (a username, a ticket id).
 */
export function sharedPart(
  kind: string,
  id: string | number,
  part: SharedPart,
  on = true,
): CSSProperties | undefined {
  if (!on) return undefined;
  return {
    viewTransitionName: vtName(`${kind}-${part}`, id),
    viewTransitionClass: `px-vt-${part}`,
  } as CSSProperties;
}

const pathOf = (loc: { pathname: string } | undefined) => loc?.pathname ?? "";

/**
 * True while a view transition runs between this screen and a screen matching
 * one of `patterns` (route patterns such as "/employee-management/:username"),
 * in either direction. Reads the router's transition context directly, so it
 * is safe outside a data router (always false there).
 */
export function useTransitionWith(...patterns: string[]): boolean {
  const vt = useContext(UNSAFE_ViewTransitionContext);
  if (!vt.isTransitioning) return false;
  const ends = [pathOf(vt.currentLocation), pathOf(vt.nextLocation)];
  return patterns.some((p) => ends.some((e) => matchPath(p, e)));
}

/** True while a view transition is bringing the person *to* `pathname`. */
export function useArrivingAt(pathname: string): boolean {
  const vt = useContext(UNSAFE_ViewTransitionContext);
  return vt.isTransitioning && pathOf(vt.nextLocation) === pathname;
}

/** True while a view transition is taking the person *away from* `pathname`. */
export function useLeaving(pathname: string): boolean {
  const vt = useContext(UNSAFE_ViewTransitionContext);
  return vt.isTransitioning && pathOf(vt.currentLocation) === pathname;
}

/** True while a view transition runs from `from` to `pathname`. */
export function useArrivingFrom(from: string, pathname: string): boolean {
  const vt = useContext(UNSAFE_ViewTransitionContext);
  return (
    vt.isTransitioning &&
    pathOf(vt.currentLocation) === from &&
    pathOf(vt.nextLocation) === pathname
  );
}

// ── Which element started the navigation ─────────────────────────────────────
// When several elements on a screen lead to the same destination (two
// dashboard widgets linking to /approvals), only the one that was clicked may
// carry the shared name. The click marks itself; the mark is short-lived.

let source: { key: string; at: number } | null = null;
const SOURCE_TTL_MS = 2000;

/** Call from the click that starts the navigation. */
export function markTransitionSource(key: string) {
  source = { key, at: Date.now() };
}

/** The key of the element that started the current navigation, if recent. */
export function transitionSource(): string | null {
  return source && Date.now() - source.at < SOURCE_TTL_MS ? source.key : null;
}

// ── Hand-off of what the source already shows ────────────────────────────────
// A detail screen fetches its record after it mounts, but the browser captures
// the new screen in the very commit the route changes — while it would still
// be a skeleton, so a shared element would have nothing to morph into. The
// list therefore hands over what it already displays (a name, an avatar URL,
// a title) and the detail screen renders those parts from it until its own
// response arrives.
//
// The hand-off is memory only (never the URL or history state), tagged with
// the signed-in session's tenant:user scope and only honoured for that scope,
// short-lived, and read once per mount. The detail screen still fetches and
// authorises the full record as before; on direct navigation there is no
// hand-off and it renders exactly as it always has.

type Handoff = { scope: string; at: number; data: unknown };
const handoffs = new Map<string, Handoff>();
const HANDOFF_TTL_MS = 10_000;

/** Call from the click that opens `kind`/`id`, with what the row displays. */
export function handOff(kind: string, id: string | number, data: unknown) {
  const scope = getScope();
  if (!scope) return;
  const now = Date.now();
  for (const [k, h] of handoffs)
    if (now - h.at > HANDOFF_TTL_MS) handoffs.delete(k);
  handoffs.set(`${kind}:${id}`, { scope, at: now, data });
}

/** The hand-off for `kind`/`id`, if one was made in this session just now. */
export function useHandoff<T>(kind: string, id: string | number): T | null {
  const [value] = useState<T | null>(() => {
    const h = handoffs.get(`${kind}:${id}`);
    const scope = getScope();
    if (!h || !scope || h.scope !== scope) return null;
    if (Date.now() - h.at > HANDOFF_TTL_MS) return null;
    return h.data as T;
  });
  return value;
}

/** Forget every hand-off (sign-out). */
export function clearHandoffs() {
  handoffs.clear();
  source = null;
}
