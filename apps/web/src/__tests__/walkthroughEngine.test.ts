import { describe, expect, it } from "vitest";
import * as engine from "@next/walkthrough/engine";
import { MODULES, canReach, matchesRoute } from "@next/walkthrough/registry";
import {
  APP_TOUR,
  STATE_SCHEMA,
  type ResolvedStep,
  type TourModuleDef,
} from "@next/walkthrough/types";

// The walkthrough's rules: who gets which steps, and how progress moves.

const employee = {
  id: "u-emp",
  tenantId: "t-1",
  tenantRole: "employee",
  permissions: [],
  wfhEnabled: true,
};
const hr = { ...employee, id: "u-hr", tenantRole: "hr" };
const owner = { ...employee, id: "u-own", tenantRole: "owner" };
const env = (user: any, docked = true) => ({ user, docked });
const build = (user: any, tour = APP_TOUR, docked = true) =>
  engine.buildSteps(tour, MODULES, env(user, docked), canReach);
const routes = (steps: ResolvedStep[]) => new Set(steps.map((s) => s.route));
const mods = (steps: ResolvedStep[]) => new Set(steps.map((s) => s.module));

describe("registry", () => {
  it("has unique, stable step ids and only real data-tour targets", () => {
    const ids = MODULES.flatMap((m) => m.steps.map((s) => `${m.id}.${s.id}`));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9._-]*$/i);
  });

  it("routes every step to a page the router actually has", async () => {
    const { NAV } = await import("@next/app/navigation");
    const navPaths = new Set(
      NAV.flat().flatMap((m) =>
        m.pages ? m.pages.map((p) => p.path) : [m.path!],
      ),
    );
    navPaths.add("/profile");
    for (const m of MODULES) {
      expect(navPaths.has(m.route)).toBe(true);
      for (const s of m.steps)
        if (s.route) expect(navPaths.has(s.route), s.route).toBe(true);
    }
  });
});

describe("filtering by role, permission and tenant features", () => {
  it("never routes an employee to HR or admin pages", () => {
    const r = routes(build(employee));
    for (const hidden of [
      "/employee-management/employee-list",
      "/employee-management/insights",
      "/attendance/insights",
      "/payroll/payroll-runs",
      "/payroll/salary-management",
      "/settings/company",
      "/permissions/manage-roles",
      "/audit-logs",
      "/analytics/workforce",
      "/subscription",
      "/platform/support",
      "/support",
    ])
      expect(r.has(hidden), hidden).toBe(false);
    for (const shown of ["/dashboard", "/attendance", "/helpdesk", "/help"])
      expect(r.has(shown), shown).toBe(true);
  });

  it("gives HR the people pages but not owner-only ones", () => {
    const r = routes(build(hr));
    expect(r.has("/employee-management/employee-list")).toBe(true);
    expect(r.has("/payroll/payroll-runs")).toBe(true);
    // Settings needs owner/admin or an explicit Organisation grant.
    expect(r.has("/settings/company")).toBe(false);
    expect(r.has("/audit-logs")).toBe(false);
    expect(r.has("/subscription")).toBe(false);
  });

  it("gives owners administration, but never the Praesto support console", () => {
    const r = routes(build(owner));
    expect(r.has("/audit-logs")).toBe(true);
    expect(r.has("/subscription")).toBe(true);
    expect(r.has("/platform/support")).toBe(false);
    expect(
      routes(build({ ...owner, isSupportAgent: true })).has(
        "/platform/support",
      ),
    ).toBe(true);
  });

  it("drops Work From Home when the organisation has it turned off", () => {
    expect(mods(build(employee)).has("wfh")).toBe(true);
    expect(mods(build({ ...employee, wfhEnabled: false })).has("wfh")).toBe(
      false,
    );
  });

  it("follows a permission grant (job openings) without a role change", () => {
    expect(mods(build(employee)).has("recruitment")).toBe(false);
    const grant = { ...employee, permissions: ["JobOpenings:view"] };
    const steps = build(grant).filter((s) => s.module === "recruitment");
    expect(steps.length).toBeGreaterThan(0);
    // …but the HR-only New Opening page stays out.
    expect(routes(steps).has("/job-openings/new")).toBe(false);
  });

  it("drops sidebar-only steps on narrow screens and adds the nav button step", () => {
    const wide = build(employee, APP_TOUR, true).map((s) => s.id);
    const narrow = build(employee, APP_TOUR, false).map((s) => s.id);
    expect(wide).toContain("welcome.sidebar");
    expect(narrow).not.toContain("welcome.sidebar");
    expect(narrow).not.toContain("welcome.account");
    expect(narrow).toContain("welcome.navigation");
    expect(wide).not.toContain("welcome.navigation");
  });

  it("builds a module tour from that module alone", () => {
    const leave = build(employee, "leave");
    expect(leave.length).toBeGreaterThan(0);
    expect(mods(leave)).toEqual(new Set(["leave"]));
    expect(build(employee, "audit")).toEqual([]);
  });

  it("lists only the modules a person can tour", () => {
    const ids = engine
      .availableModules(MODULES, env(employee), canReach)
      .map((m) => m.id);
    expect(ids).toContain("leave");
    expect(ids).not.toContain("settings");
  });

  it("re-evaluates on a tenant switch (the new user object)", () => {
    const before = mods(build(owner));
    const after = mods(
      build({ ...owner, tenantId: "t-2", tenantRole: "employee" }),
    );
    expect(before.has("settings")).toBe(true);
    expect(after.has("settings")).toBe(false);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

const fixture: TourModuleDef[] = [
  {
    id: "a",
    label: "A",
    summary: "",
    route: "/a",
    steps: [
      { id: "1", target: "a1", title: "", content: "" },
      { id: "2", target: "a2", title: "", content: "" },
    ],
  },
  {
    id: "b",
    label: "B",
    summary: "",
    route: "/b",
    steps: [
      { id: "1", target: "b1", title: "", content: "" },
      { id: "2", target: "b2", title: "", content: "" },
    ],
  },
];
const steps = engine.buildSteps(APP_TOUR, fixture, env(employee), () => true);
const pos = (s: ReturnType<typeof engine.emptyState>, tour = APP_TOUR) =>
  engine.progressOf(s, tour);

describe("lifecycle", () => {
  it("starts at the first step", () => {
    const s = engine.start(engine.emptyState(), APP_TOUR, steps);
    expect(s.active).toBe(APP_TOUR);
    expect(pos(s)).toMatchObject({ status: "running", stepId: "a.1" });
  });

  it("advances and goes back, recording seen steps", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.next(s, steps);
    s = engine.next(s, steps);
    expect(pos(s)).toMatchObject({ stepId: "b.1", seen: ["a.1", "a.2"] });
    s = engine.back(s, steps);
    expect(pos(s).stepId).toBe("a.2");
    // Back on the first step does nothing.
    const first = engine.start(engine.emptyState(), APP_TOUR, steps);
    expect(engine.back(first, steps)).toBe(first);
  });

  it("pauses and resumes at the same step", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.next(s, steps);
    s = engine.pause(s, "/a");
    expect(pos(s)).toMatchObject({
      status: "paused",
      stepId: "a.2",
      lastRoute: "/a",
    });
    expect(s.active).toBe(APP_TOUR);
    s = engine.start(s, APP_TOUR, steps);
    expect(pos(s)).toMatchObject({ status: "running", stepId: "a.2" });
  });

  it("skipping a step skips only that step", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.skipStep(s, steps);
    expect(pos(s)).toMatchObject({
      status: "running",
      stepId: "a.2",
      skipped: ["a.1"],
      seen: [],
    });
  });

  it("a missing target going backwards keeps going backwards", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.next(engine.next(s, steps), steps); // b.1
    s = engine.skipStep(s, steps, -1);
    expect(pos(s).stepId).toBe("a.2");
    // …and from the first step, forwards (never stuck).
    const first = engine.start(engine.emptyState(), APP_TOUR, steps);
    expect(pos(engine.skipStep(first, steps, -1)).stepId).toBe("a.2");
  });

  it("skips the rest of a section", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.skipModule(s, steps);
    expect(pos(s)).toMatchObject({ stepId: "b.1", skipped: ["a.1", "a.2"] });
  });

  it("completes after the last step, and doesn't restart by itself", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    for (let i = 0; i < steps.length; i++) s = engine.next(s, steps);
    expect(pos(s).status).toBe("completed");
    expect(engine.next(s, steps)).toBe(s);
    // Starting a completed tour begins again from the top.
    s = engine.start(s, APP_TOUR, steps);
    expect(pos(s)).toMatchObject({
      status: "running",
      stepId: "a.1",
      seen: [],
    });
  });

  it("skipping the whole tour is not completing it", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.dismiss(s, APP_TOUR);
    expect(pos(s).status).toBe("dismissed");
    expect(s.active).toBeNull();
    // A completed tour stays completed.
    let done = engine.start(engine.emptyState(), APP_TOUR, steps);
    for (let i = 0; i < steps.length; i++) done = engine.next(done, steps);
    expect(pos(engine.dismiss(done, APP_TOUR)).status).toBe("completed");
  });

  it("restarts from the beginning, forgetting progress", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.next(engine.skipStep(s, steps), steps);
    s = engine.restart(s, APP_TOUR, steps);
    expect(pos(s)).toMatchObject({ stepId: "a.1", seen: [], skipped: [] });
  });

  it("keeps module tour progress apart from the app tour", () => {
    let s = engine.start(engine.emptyState(), APP_TOUR, steps);
    s = engine.next(s, steps);
    const bOnly = engine.buildSteps("b", fixture, env(employee), () => true);
    s = engine.start(s, "b", bOnly);
    expect(s.active).toBe("b");
    expect(pos(s, APP_TOUR)).toMatchObject({ status: "paused", stepId: "a.2" });
    expect(pos(s, "b")).toMatchObject({ status: "running", stepId: "b.1" });
  });

  it("resumes at a removed step's module, else the first unseen step", () => {
    const p = { ...engine.emptyProgress(), stepId: "b.gone" };
    expect(engine.resumeIndex(steps, p)).toBe(2);
    const q = { ...engine.emptyProgress(), stepId: "zz.gone", seen: ["a.1"] };
    expect(engine.resumeIndex(steps, q)).toBe(1);
    expect(engine.resumeIndex([], q)).toBe(-1);
  });
});

describe("saved state", () => {
  const saved = (over: any = {}) => ({
    schema: STATE_SCHEMA,
    version: 1,
    active: "app",
    updatedAt: "2026-10-01T00:00:00.000Z",
    tours: {
      app: {
        status: "running",
        stepId: "leave.form",
        seen: ["welcome.hello"],
        skipped: [],
        lastRoute: "/attendance/apply-leave",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    },
    ...over,
  });

  it("comes back paused on a new session, running on a refresh", () => {
    expect(engine.normalize(saved())!.tours.app.status).toBe("paused");
    expect(
      engine.normalize(saved(), { keepRunning: true })!.tours.app.status,
    ).toBe("running");
  });

  it("rejects malformed or foreign data without throwing", () => {
    for (const bad of [null, 1, "x", [], {}, { schema: 99, tours: {} }])
      expect(engine.normalize(bad)).toBeNull();
    const s = engine.normalize(
      saved({
        active: "nope",
        tours: {
          app: { status: "weird" },
          "<script>": { status: "paused" },
          leave: {
            status: "paused",
            stepId: "../../etc",
            seen: ["ok.1", 5, "<b>"],
            lastRoute: "https://evil.example",
          },
        },
      }),
    )!;
    expect(Object.keys(s.tours)).toEqual(["leave"]);
    expect(s.tours.leave).toMatchObject({
      stepId: null,
      seen: ["ok.1"],
      lastRoute: null,
    });
    expect(s.active).toBeNull();
  });

  it("tolerates an older walkthrough version (reconciled by id)", () => {
    const s = engine.normalize(saved({ version: 0 }))!;
    expect(s.version).toBe(0);
    const i = engine.resumeIndex(build(employee), s.tours.app);
    expect(build(employee)[i].id).toBe("leave.form");
  });

  it("picks the newer of two copies", () => {
    const a = engine.normalize(saved())!;
    const b = engine.normalize(
      saved({ updatedAt: "2026-10-02T00:00:00.000Z" }),
    )!;
    expect(engine.newer(a, b)).toBe(b);
    expect(engine.newer(null, a)).toBe(a);
  });
});

describe("matchesRoute", () => {
  it("accepts a page's own redirect to an unlisted sub-page", () => {
    expect(matchesRoute("/profile", "/profile")).toBe(true);
    expect(matchesRoute("/profile/basic-info", "/profile")).toBe(true);
    expect(matchesRoute("/profile/basic-info/", "/profile")).toBe(true);
  });

  it("doesn't confuse a sibling page with its parent route", () => {
    expect(matchesRoute("/attendance/insights", "/attendance")).toBe(false);
    expect(matchesRoute("/attendance/apply-leave", "/attendance")).toBe(false);
    expect(matchesRoute("/help/tours", "/help")).toBe(false);
    // A record page under an alias isn't the list page.
    expect(
      matchesRoute(
        "/employee-management/jane",
        "/employee-management/employee-list",
      ),
    ).toBe(false);
    expect(matchesRoute("/elsewhere", "/profile")).toBe(false);
  });
});
