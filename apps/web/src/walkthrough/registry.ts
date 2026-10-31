import { NAV, searchableNav } from "@next/app/navigation";
import type { CanReach } from "./engine";
import type { TourModuleDef } from "./types";
import { workspaceTours } from "./tours/workspace";
import { peopleTours } from "./tours/people";
import { timeTours } from "./tours/time";
import { workTours } from "./tours/work";
import { adminTours } from "./tours/admin";

// Every module's tour, in the order the app tour visits them (the sidebar's
// order). To add a module, write its definition in tours/ and list it here —
// see docs/walkthrough.md. Loaded only when a tour starts or the Product
// Tours page opens, never with the app shell.

const byOrder = (ids: string[], defs: TourModuleDef[]) =>
  ids.map((id) => {
    const m = defs.find((d) => d.id === id);
    if (!m) throw new Error(`walkthrough: no module "${id}"`);
    return m;
  });

const ALL = [
  ...workspaceTours,
  ...peopleTours,
  ...timeTours,
  ...workTours,
  ...adminTours,
];

export const MODULES: TourModuleDef[] = byOrder(
  [
    "welcome",
    "today",
    "approvals",
    "calendar",
    "chat",
    "employees",
    "org",
    "attendance",
    "leave",
    "wfh",
    "holidays",
    "kyc",
    "recruitment",
    "performance",
    "payroll",
    "assets",
    "resignations",
    "announcements",
    "policies",
    "helpdesk",
    "analytics",
    "reports",
    "permissions",
    "settings",
    "audit",
    "subscription",
    "ai-assistants",
    "profile",
    "help",
  ],
  ALL,
);

/** Signed-in pages outside the navigation table that everyone can open. */
const OPEN_ROUTES = new Set(["/profile"]);

/**
 * A route is in a tour only if the person could open it from the app's own
 * navigation — the same visibility predicates the sidebar, ⌘K and the route
 * gates use (role, permissions, WFH enabled for the tenant, subscription
 * access, Praesto staff). The walkthrough never grants anything; the server
 * still enforces every request.
 */
export const canReach: CanReach = (route, env) =>
  OPEN_ROUTES.has(route) ||
  searchableNav(env.user).some((e) => e.path === route);

/** Every path the app's navigation knows, including aliases. */
const KNOWN_PATHS = [
  ...OPEN_ROUTES,
  ...NAV.flat().flatMap((m) => [
    ...(m.path ? [m.path, ...(m.also ?? [])] : []),
    ...(m.pages ?? []).flatMap((p) => [p.path, ...(p.also ?? [])]),
  ]),
];

/**
 * Is the person on a step's route? Exactly, or on a sub-page of it that the
 * navigation doesn't list separately — /profile redirects itself to
 * /profile/basic-info, and that's still the profile step's page. A sub-path
 * that is its own page (/attendance/insights vs /attendance) doesn't count.
 */
export function matchesRoute(pathname: string, route: string | null): boolean {
  if (!route) return true;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === route) return true;
  if (!path.startsWith(`${route}/`)) return false;
  const longest = KNOWN_PATHS.filter(
    (k) => path === k || path.startsWith(`${k}/`),
  ).sort((a, b) => b.length - a.length)[0];
  return longest === route;
}
