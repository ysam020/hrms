import {
  APP_TOUR,
  STATE_SCHEMA,
  WALKTHROUGH_VERSION,
  type ResolvedStep,
  type TourEnv,
  type TourModuleDef,
  type TourProgress,
  type WalkthroughState,
} from "./types";

// The walkthrough's rules, as pure functions: which steps a person gets, and
// how progress moves. The runner (Runner.tsx) and the provider only call
// these, so every lifecycle rule is testable without a browser.

const now = () => new Date().toISOString();

export function emptyState(): WalkthroughState {
  return {
    schema: STATE_SCHEMA,
    version: WALKTHROUGH_VERSION,
    active: null,
    tours: {},
    updatedAt: now(),
  };
}

export function emptyProgress(): TourProgress {
  return {
    status: "not_started",
    stepId: null,
    seen: [],
    skipped: [],
    lastRoute: null,
    updatedAt: now(),
  };
}

export const progressOf = (s: WalkthroughState, tour: string): TourProgress =>
  s.tours[tour] ?? emptyProgress();

// ── Building a tour ─────────────────────────────────────────────────────────

/** Whether a route is one the person may open (the nav's own predicates). */
export type CanReach = (route: string, env: TourEnv) => boolean;

/**
 * The steps of one tour for this person, in order. The app tour is every
 * module that applies; a module tour is that module alone. Steps whose route
 * the person can't open, whose condition fails, or that need the docked
 * sidebar on a narrow screen are left out here, so the tour never points at
 * something they can't use.
 */
export function buildSteps(
  tour: string,
  modules: TourModuleDef[],
  env: TourEnv,
  canReach: CanReach,
): ResolvedStep[] {
  const chosen =
    tour === APP_TOUR ? modules : modules.filter((m) => m.id === tour);
  const out: ResolvedStep[] = [];
  for (const m of chosen) {
    if (m.when && !m.when(env)) continue;
    if (!canReach(m.route, env)) continue;
    for (const st of m.steps) {
      const route = st.route === undefined ? m.route : st.route;
      if (route && !canReach(route, env)) continue;
      if (st.sidebar && !env.docked) continue;
      if (st.when && !st.when(env)) continue;
      out.push({
        id: `${m.id}.${st.id}`,
        module: m.id,
        moduleLabel: m.label,
        target: (Array.isArray(st.target) ? st.target : [st.target]).map(
          selectorFor,
        ),
        title: st.title,
        content: st.content,
        route,
        placement: st.placement ?? "bottom",
        prepare: st.prepare,
        timeout: st.timeout,
      });
    }
  }
  return out;
}

/** The modules that apply to this person (for the Product Tours list). */
export function availableModules(
  modules: TourModuleDef[],
  env: TourEnv,
  canReach: CanReach,
) {
  return modules.filter(
    (m) => buildSteps(m.id, modules, env, canReach).length > 0,
  );
}

/** `[data-tour="x"]` for bare names; anything else is used as a selector. */
export const selectorFor = (target: string) =>
  /^[a-z0-9][a-z0-9-]*$/i.test(target) ? `[data-tour="${target}"]` : target;

/** Does the current pathname satisfy a step's route? */
export const onRoute = (pathname: string, route: string | null) =>
  !route || pathname.replace(/\/+$/, "") === route.replace(/\/+$/, "");

// ── Positions ───────────────────────────────────────────────────────────────

/**
 * Where to resume in `steps` for saved progress. Ids are stable, so the
 * saved step is found even if steps were added around it. If it no longer
 * exists (removed, or no longer allowed for this person), resume at the
 * start of its module, else at the first step not yet seen.
 */
export function resumeIndex(steps: ResolvedStep[], p: TourProgress): number {
  if (!steps.length) return -1;
  if (p.stepId) {
    const i = steps.findIndex((s) => s.id === p.stepId);
    if (i >= 0) return i;
    const mod = p.stepId.split(".")[0];
    const m = steps.findIndex((s) => s.module === mod);
    if (m >= 0) return m;
  }
  const done = new Set([...p.seen, ...p.skipped]);
  const i = steps.findIndex((s) => !done.has(s.id));
  return i >= 0 ? i : 0;
}

// ── Transitions ─────────────────────────────────────────────────────────────

const uniq = (xs: string[]) => [...new Set(xs)];

function put(
  s: WalkthroughState,
  tour: string,
  patch: Partial<TourProgress>,
  active: string | null = s.active,
): WalkthroughState {
  const t = now();
  return {
    ...s,
    schema: STATE_SCHEMA,
    version: WALKTHROUGH_VERSION,
    active,
    updatedAt: t,
    tours: {
      ...s.tours,
      [tour]: { ...progressOf(s, tour), ...patch, updatedAt: t },
    },
  };
}

/** Pause whatever else is running: one tour at a time. */
function pauseOthers(s: WalkthroughState, tour: string): WalkthroughState {
  if (!s.active || s.active === tour) return s;
  const other = progressOf(s, s.active);
  return other.status === "running"
    ? put(s, s.active, { status: "paused" }, s.active)
    : s;
}

/** Start or resume a tour where it left off (the beginning if new or done). */
export function start(
  s: WalkthroughState,
  tour: string,
  steps: ResolvedStep[],
): WalkthroughState {
  if (!steps.length) return s;
  const base = pauseOthers(s, tour);
  const p = progressOf(base, tour);
  const fresh = p.status === "completed" || p.status === "not_started";
  if (fresh) return restart(base, tour, steps);
  const i = resumeIndex(steps, p);
  return put(base, tour, { status: "running", stepId: steps[i].id }, tour);
}

/** From the first step, forgetting what was seen and skipped. */
export function restart(
  s: WalkthroughState,
  tour: string,
  steps: ResolvedStep[],
): WalkthroughState {
  if (!steps.length) return s;
  return put(
    pauseOthers(s, tour),
    tour,
    { status: "running", stepId: steps[0].id, seen: [], skipped: [] },
    tour,
  );
}

function at(s: WalkthroughState, steps: ResolvedStep[]) {
  const tour = s.active;
  if (!tour) return null;
  const p = progressOf(s, tour);
  if (p.status !== "running") return null;
  const i = steps.findIndex((x) => x.id === p.stepId);
  return i < 0 ? null : { tour, p, i, step: steps[i] };
}

/** Next: the current step counts as seen. Past the last step: completed. */
export function next(s: WalkthroughState, steps: ResolvedStep[]) {
  const c = at(s, steps);
  if (!c) return s;
  const seen = uniq([...c.p.seen, c.step.id]);
  const skipped = c.p.skipped.filter((id) => id !== c.step.id);
  if (c.i + 1 >= steps.length)
    return put(s, c.tour, { status: "completed", seen, skipped });
  return put(s, c.tour, { stepId: steps[c.i + 1].id, seen, skipped });
}

export function back(s: WalkthroughState, steps: ResolvedStep[]) {
  const c = at(s, steps);
  if (!c || c.i === 0) return s;
  return put(s, c.tour, { stepId: steps[c.i - 1].id });
}

/**
 * Skip only this step: recorded as skipped, not seen. `unavailable` is the
 * runner reporting a step whose target never appeared — same bookkeeping,
 * but it moves in the direction the user was going, so Back over a missing
 * step doesn't bounce forward again.
 */
export function skipStep(
  s: WalkthroughState,
  steps: ResolvedStep[],
  direction: 1 | -1 = 1,
) {
  const c = at(s, steps);
  if (!c) return s;
  const skipped = uniq([...c.p.skipped, c.step.id]);
  let j = c.i + direction;
  // Going back from the first step: there's nothing behind, so go forward.
  if (j < 0) j = c.i + 1;
  if (j >= steps.length)
    return put(s, c.tour, { status: "completed", skipped });
  return put(s, c.tour, { stepId: steps[j].id, skipped });
}

/** Skip the rest of the current module (app tour): on to the next one. */
export function skipModule(s: WalkthroughState, steps: ResolvedStep[]) {
  const c = at(s, steps);
  if (!c) return s;
  let j = c.i;
  const rest: string[] = [];
  while (j < steps.length && steps[j].module === c.step.module) {
    rest.push(steps[j].id);
    j++;
  }
  const skipped = uniq([...c.p.skipped, ...rest]);
  if (j >= steps.length)
    return put(s, c.tour, { status: "completed", skipped });
  return put(s, c.tour, { stepId: steps[j].id, skipped });
}

/** Pause: keep the position; the tour stays the active (resumable) one. */
export function pause(s: WalkthroughState, lastRoute?: string | null) {
  const tour = s.active;
  if (!tour || progressOf(s, tour).status !== "running") return s;
  return put(s, tour, {
    status: "paused",
    ...(lastRoute !== undefined ? { lastRoute } : {}),
  });
}

/** Skip the whole tour. It isn't completed, and it never starts by itself. */
export function dismiss(s: WalkthroughState, tour: string) {
  const p = progressOf(s, tour);
  if (p.status === "completed") return s;
  return put(
    s,
    tour,
    { status: "dismissed" },
    s.active === tour ? null : s.active,
  );
}

export function recordRoute(s: WalkthroughState, route: string) {
  const tour = s.active;
  if (!tour || progressOf(s, tour).lastRoute === route) return s;
  return put(s, tour, { lastRoute: route });
}

// ── Loading saved state ─────────────────────────────────────────────────────

const STATUSES = new Set([
  "not_started",
  "running",
  "paused",
  "completed",
  "dismissed",
]);
const ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const ids = (xs: unknown) =>
  Array.isArray(xs)
    ? uniq(xs.filter((x): x is string => typeof x === "string" && ID.test(x)))
    : [];

/**
 * Validate saved state from storage or the server. Anything malformed is
 * dropped (that tour starts over); nothing here can throw. A running tour
 * comes back paused unless `keepRunning` (a refresh of the same tab), so
 * signing in never drops someone into a tour.
 */
export function normalize(
  raw: unknown,
  { keepRunning = false }: { keepRunning?: boolean } = {},
): WalkthroughState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (r.schema !== STATE_SCHEMA || typeof r.tours !== "object" || !r.tours)
    return null;
  const tours: Record<string, TourProgress> = {};
  for (const [k, v] of Object.entries(r.tours as Record<string, any>)) {
    if (!ID.test(k) || !v || typeof v !== "object") continue;
    if (!STATUSES.has(v.status)) continue;
    let status = v.status as TourProgress["status"];
    if (status === "running" && !(keepRunning && r.active === k))
      status = "paused";
    tours[k] = {
      status,
      stepId:
        typeof v.stepId === "string" && ID.test(v.stepId) ? v.stepId : null,
      seen: ids(v.seen),
      skipped: ids(v.skipped),
      lastRoute:
        typeof v.lastRoute === "string" && v.lastRoute.startsWith("/")
          ? v.lastRoute.slice(0, 300)
          : null,
      updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : now(),
    };
  }
  const active =
    typeof r.active === "string" &&
    tours[r.active] &&
    ["running", "paused"].includes(tours[r.active].status)
      ? r.active
      : null;
  return {
    schema: STATE_SCHEMA,
    version: typeof r.version === "number" ? r.version : 0,
    active,
    tours,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : now(),
  };
}

/** The more recently updated of two saved states. */
export function newer(
  a: WalkthroughState | null,
  b: WalkthroughState | null,
): WalkthroughState | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}
