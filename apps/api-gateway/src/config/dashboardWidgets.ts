// Server-owned registry for the Today dashboard. This is the authority on
// which widgets exist, what each one requires, what a saved layout may
// contain, and every persona's default layout. The web app keeps its own
// presentation registry (apps/web/src/features/dashboard/widgets) keyed by
// the same ids and renders only what GET /dashboard says the caller may use —
// the same split as permissionCatalog.ts vs. the frontend permission editor.
// See docs/dashboard-role-matrix.md.

export const CAPABILITIES = [
  "self",
  "teamLead",
  "hr",
  "orgAdmin",
  "recruiting",
  "payroll",
  "advances",
  "reviews",
  "kyc",
  "exits",
  "helpdesk",
  "assets",
  "joinRequests",
  "subscription",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Capabilities = Record<Capability, boolean>;

export type WidgetSize = "standard" | "wide";

export interface SettingSpec {
  /** Allowed values. "dynamic" options (team ids, departments) are checked against the caller's data when read. */
  options: readonly (string | number)[] | "teams" | "departments";
  default: string | number;
}

export interface WidgetSpec {
  id: string;
  /** Any one of these capabilities is enough. */
  requires: readonly Capability[];
  sizes: readonly WidgetSize[];
  defaultSize: WidgetSize;
  settings?: Record<string, SettingSpec>;
  /** "server": data from GET /dashboard/data. "client": the widget reads existing self-scoped endpoints. */
  source: "server" | "client";
}

export const WIDGETS: readonly WidgetSpec[] = [
  {
    id: "my-day",
    requires: ["self"],
    sizes: ["wide"],
    defaultSize: "wide",
    source: "client",
  },
  {
    id: "approvals",
    requires: ["self"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    source: "client",
  },
  {
    id: "team-today",
    requires: ["teamLead"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    settings: { team: { options: "teams", default: "all" } },
    source: "server",
  },
  {
    id: "team-leave",
    requires: ["teamLead"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    settings: { days: { options: [7, 14, 30], default: 14 } },
    source: "server",
  },
  {
    id: "org-today",
    requires: ["hr"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    settings: { department: { options: "departments", default: "all" } },
    source: "server",
  },
  {
    id: "hr-queue",
    requires: [
      "kyc",
      "exits",
      "helpdesk",
      "assets",
      "advances",
      "joinRequests",
    ],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "workforce",
    requires: ["hr"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "joiners-leavers",
    requires: ["hr", "exits"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "headcount-trend",
    requires: ["hr"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    settings: { months: { options: [6, 12], default: 6 } },
    source: "server",
  },
  {
    id: "attendance-trend",
    requires: ["hr"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    settings: { days: { options: [7, 14, 30], default: 14 } },
    source: "server",
  },
  {
    id: "hiring",
    requires: ["recruiting"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "payroll",
    requires: ["payroll"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "review-cycle",
    requires: ["reviews"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "org-admin",
    requires: ["joinRequests", "subscription"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "leave-balance",
    requires: ["self"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "my-requests",
    requires: ["self"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "my-reviews",
    requires: ["self"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "payslip",
    requires: ["self"],
    sizes: ["standard"],
    defaultSize: "standard",
    source: "server",
  },
  {
    id: "announcements",
    requires: ["self"],
    sizes: ["wide", "standard"],
    defaultSize: "wide",
    source: "client",
  },
  {
    id: "agenda",
    requires: ["self"],
    sizes: ["standard", "wide"],
    defaultSize: "standard",
    source: "client",
  },
];

export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export type Persona =
  | "executive"
  | "people-ops"
  | "recruiter"
  | "team-lead"
  | "employee";

/**
 * Default layouts, in priority order. Standard-size widgets are listed in
 * pairs between wide ones so the two-column grid has no gaps. A person matching several personas
 * gets every matching list merged in this order, without duplicates.
 * "my-day" and "approvals" lead every list on purpose: they're the two
 * things everyone acts on first.
 */
export const PERSONAS: {
  id: Persona;
  matches: (c: Capabilities) => boolean;
  widgets: string[];
}[] = [
  {
    id: "executive",
    matches: (c) => c.orgAdmin,
    widgets: [
      "my-day",
      "approvals",
      "org-today",
      "workforce",
      "hiring",
      "headcount-trend",
      "org-admin",
      "agenda",
      "announcements",
    ],
  },
  {
    id: "people-ops",
    matches: (c) => c.hr && !c.orgAdmin,
    // Payroll runs are restricted to owner/admin/HR, so there is no separate
    // payroll persona: HR runs payroll in Praesto.
    widgets: [
      "my-day",
      "approvals",
      "org-today",
      "hr-queue",
      "joiners-leavers",
      "payroll",
      "workforce",
      "my-reviews",
      "agenda",
      "announcements",
    ],
  },
  {
    id: "recruiter",
    matches: (c) => c.recruiting && !c.hr,
    widgets: [
      "my-day",
      "approvals",
      "hiring",
      "leave-balance",
      "agenda",
      "announcements",
    ],
  },
  {
    id: "team-lead",
    matches: (c) => c.teamLead,
    widgets: [
      "my-day",
      "approvals",
      "team-today",
      "team-leave",
      "leave-balance",
      "my-requests",
      "my-reviews",
      "agenda",
      "announcements",
    ],
  },
  {
    id: "employee",
    matches: () => true,
    widgets: [
      "my-day",
      "approvals",
      "leave-balance",
      "my-requests",
      "my-reviews",
      "payslip",
      "agenda",
      "announcements",
    ],
  },
];

/**
 * The personas a person matches, in priority order. "employee" applies only
 * when nothing else does: every other persona's list already includes the
 * personal widgets that role needs, and adding the employee list would push
 * personal widgets above the ones the role is for.
 */
export function personasFor(c: Capabilities): Persona[] {
  const matched = PERSONAS.filter((p) => p.matches(c)).map((p) => p.id);
  return matched.length > 1 ? matched.filter((p) => p !== "employee") : matched;
}

export function isAuthorized(spec: WidgetSpec, c: Capabilities): boolean {
  return spec.requires.some((cap) => c[cap]);
}

export interface LayoutEntry {
  id: string;
  visible: boolean;
  size: WidgetSize;
  settings: Record<string, string | number>;
}

export const PREFERENCES_VERSION = 1;

export function defaultSettings(
  spec: WidgetSpec,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, s] of Object.entries(spec.settings ?? {})) out[k] = s.default;
  return out;
}

/** Every authorized widget, defaults first (visible), the rest hidden after. */
export function defaultLayout(c: Capabilities): LayoutEntry[] {
  const order: string[] = [];
  for (const p of personasFor(c)) {
    for (const id of PERSONAS.find((x) => x.id === p)!.widgets)
      if (!order.includes(id)) order.push(id);
  }
  const visible = new Set(order);
  const authorized = WIDGETS.filter((w) => isAuthorized(w, c));
  const entries: LayoutEntry[] = [];
  for (const id of order) {
    const spec = WIDGET_BY_ID.get(id);
    if (!spec || !isAuthorized(spec, c)) continue;
    entries.push({
      id,
      visible: true,
      size: spec.defaultSize,
      settings: defaultSettings(spec),
    });
  }
  for (const spec of authorized) {
    if (visible.has(spec.id)) continue;
    entries.push({
      id: spec.id,
      visible: false,
      size: spec.defaultSize,
      settings: defaultSettings(spec),
    });
  }
  return entries;
}

/**
 * Validate one setting value. Static options are checked here; "teams" and
 * "departments" are checked against `dynamic` (the caller's own teams, the
 * tenant's departments). Anything invalid falls back to the default.
 */
function cleanSetting(
  spec: SettingSpec,
  value: unknown,
  dynamic: { teams: string[]; departments: string[] },
) {
  if (spec.options === "teams" || spec.options === "departments") {
    const allowed =
      spec.options === "teams" ? dynamic.teams : dynamic.departments;
    return typeof value === "string" &&
      (value === "all" || allowed.includes(value))
      ? value
      : spec.default;
  }
  return (spec.options as readonly unknown[]).includes(value)
    ? (value as string | number)
    : spec.default;
}

/**
 * Turn a saved (or client-sent) layout into a safe one for this caller:
 * unknown and unauthorized widgets dropped, sizes and settings validated,
 * newly available widgets appended (hidden) so they show up in Customize.
 * Preferences can hide and reorder; they can never grant.
 */
export function sanitizeLayout(
  raw: unknown,
  c: Capabilities,
  dynamic: { teams: string[]; departments: string[] },
): LayoutEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: LayoutEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as any).id ?? "");
    const spec = WIDGET_BY_ID.get(id);
    if (!spec || seen.has(id) || !isAuthorized(spec, c)) continue;
    seen.add(id);
    const size = spec.sizes.includes((item as any).size)
      ? (item as any).size
      : spec.defaultSize;
    const settings: Record<string, string | number> = {};
    for (const [k, s] of Object.entries(spec.settings ?? {}))
      settings[k] = cleanSetting(s, (item as any).settings?.[k], dynamic);
    out.push({ id, visible: (item as any).visible !== false, size, settings });
  }
  for (const entry of defaultLayout(c)) {
    if (!seen.has(entry.id)) out.push({ ...entry, visible: false });
  }
  return out;
}
