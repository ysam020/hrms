import { Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  prisma as masterPrisma,
  prismaWithTenant as prisma,
  getTenantId,
  markHandlerStart,
  limitReads,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import {
  apiResponse,
  RESPONSE_STATUS,
  hasPrivilegedRole,
  HR_ROLES,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { leaveClient, grpcCall } from "../grpc/clients";
import { getActiveSettings } from "./tenantSettings";
import { listHolidays } from "./general";
import { getWorkingDays } from "../utils/workingDays";
import { getSeatStatus } from "../utils/planLimits";
import {
  CAPABILITIES,
  PREFERENCES_VERSION,
  WIDGET_BY_ID,
  WIDGETS,
  defaultLayout,
  isAuthorized,
  personasFor,
  sanitizeLayout,
  type Capabilities,
  type LayoutEntry,
} from "../config/dashboardWidgets";
import { loadUserAccess } from "../services/userAccess";

dayjs.extend(utc);

// The Today dashboard (docs/dashboard-role-matrix.md).
//
//   GET    /dashboard              capabilities, available widgets, layout
//   GET    /dashboard/data?ids=…   data for the requested widgets
//   PUT    /dashboard/preferences  save a layout (validated, never widening)
//   DELETE /dashboard/preferences  back to the role defaults
//
// Every request re-resolves the caller's capabilities from the database, so a
// permission change applies on the next load. Widget data is computed here
// with tenant-scoped clients and only for widgets the caller may use; widget
// settings are read from the caller's saved layout, never from the query.

// ── Who is asking ───────────────────────────────────────────────────────────

interface Caller {
  userId: string;
  tenantId: string;
  capabilities: Capabilities;
  /** Teams the caller leads that have members. */
  teams: { id: string; name: string; members: string[] }[];
}

export async function resolveCaller(req: AuthRequest): Promise<Caller> {
  const { userId, tenantRole } = req.user!;
  const tenantId = (getTenantId() ?? req.user!.tenantId)!;
  const [user, ledTeams] = await Promise.all([
    loadUserAccess(userId, { tenantScoped: true }),
    prisma.team.findMany({
      where: { teamLeaderId: userId },
      select: { id: true, teamName: true, members: true },
    }),
  ]);
  const perms: string[] = (user?.permissions as string[]) ?? [];
  const has = (p: string) => perms.includes(p);
  const superUser = Boolean(user?.isSuperUser);
  const role = tenantRole ?? "";
  const hr = superUser || hasPrivilegedRole(role, HR_ROLES);
  const orgAdmin = superUser || hasPrivilegedRole(role);
  const teams = ledTeams
    .map((t) => ({
      id: t.id,
      name: t.teamName,
      members: (t.members ?? []).filter((m) => m !== userId),
    }))
    .filter((t) => t.members.length > 0);

  const capabilities: Capabilities = {
    self: true,
    teamLead: teams.length > 0,
    hr,
    orgAdmin,
    recruiting: hr || perms.some((p) => p.startsWith("JobOpenings:")),
    // Same gate as GET /payroll/runs (assertRole owner/admin/hr).
    payroll: superUser || hasPrivilegedRole(role, HR_ROLES),
    advances: hr || has("SalaryManagement:approve_advance"),
    reviews: hr || has("PerformanceReview:manage_cycles"),
    kyc:
      hr ||
      has("BasicKYCDetails:view_kyc:all") ||
      has("BasicKYCDetails:approve_kyc:all"),
    exits: hr || has("ResignationProcess:view_resignation:all"),
    helpdesk: hr || has("Helpdesk:manage"),
    assets: hr || has("Assets:manage"),
    joinRequests: orgAdmin || has("Organisation:approve_join_requests"),
    subscription: orgAdmin || perms.some((p) => p.startsWith("Subscription:")),
  };
  return { userId, tenantId, capabilities, teams };
}

async function activeDepartments(
  tenantId: string,
  options: { fresh?: boolean } = {},
): Promise<string[]> {
  const people = await rosterFor(tenantId, options);
  const names = new Set<string>();
  for (const p of people) {
    if (p.employeeStatus === "Active" && p.department)
      names.add(p.department as string);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function findPreference(tenantId: string, userId: string) {
  return prisma.dashboardPreference.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
}

/**
 * The caller and the saved layout row, read concurrently — the row only
 * needs ids from the token, so it needn't wait for resolveCaller. When the
 * token's role already grants HR, the department list (needed to validate a
 * saved layout) starts at the same time too; a superuser without an HR role
 * still gets it, just one step later, from loadLayout.
 */
async function resolveCallerAndPreference(req: AuthRequest) {
  const tenantId = (getTenantId() ?? req.user!.tenantId)!;
  const departments = hasPrivilegedRole(req.user!.tenantRole ?? "", HR_ROLES)
    ? activeDepartments(tenantId)
    : undefined;
  // Settle the speculative read now so a failure surfaces where it's used.
  departments?.catch(() => undefined);
  const [caller, preference] = await Promise.all([
    resolveCaller(req),
    findPreference(tenantId, req.user!.userId),
  ]);
  return [caller, preference, departments] as const;
}

async function loadLayout(
  caller: Caller,
  preference?: Awaited<ReturnType<typeof findPreference>>,
  prefetchedDepartments?: Promise<string[]>,
): Promise<{
  layout: LayoutEntry[];
  customized: boolean;
  departments: string[];
}> {
  const [row, departments] = await Promise.all([
    preference !== undefined
      ? preference
      : findPreference(caller.tenantId, caller.userId),
    caller.capabilities.hr
      ? (prefetchedDepartments ?? activeDepartments(caller.tenantId))
      : Promise.resolve([]),
  ]);
  const dynamic = { teams: caller.teams.map((t) => t.id), departments };
  if (!row || row.version !== PREFERENCES_VERSION)
    return {
      layout: defaultLayout(caller.capabilities),
      customized: false,
      departments,
    };
  return {
    layout: sanitizeLayout(row.widgets, caller.capabilities, dynamic),
    customized: true,
    departments,
  };
}

function describe(caller: Caller, departments: string[]) {
  return {
    capabilities: CAPABILITIES.filter((c) => caller.capabilities[c]),
    personas: personasFor(caller.capabilities),
    widgets: WIDGETS.filter((w) => isAuthorized(w, caller.capabilities)).map(
      (w) => ({
        id: w.id,
        sizes: w.sizes,
        defaultSize: w.defaultSize,
        source: w.source,
        settings: Object.fromEntries(
          Object.entries(w.settings ?? {}).map(([k, s]) => [
            k,
            {
              default: s.default,
              options:
                s.options === "teams"
                  ? [
                      { value: "all", label: "All My Teams" },
                      ...caller.teams.map((t) => ({
                        value: t.id,
                        label: t.name,
                      })),
                    ]
                  : s.options === "departments"
                    ? [
                        { value: "all", label: "All Departments" },
                        ...departments.map((d) => ({ value: d, label: d })),
                      ]
                    : s.options.map((o) => ({ value: o, label: String(o) })),
            },
          ]),
        ),
      }),
    ),
    defaults: defaultLayout(caller.capabilities),
  };
}

/** GET /dashboard */
export async function getDashboard(req: AuthRequest, res: Response) {
  try {
    const [caller, preference, prefetched] =
      await resolveCallerAndPreference(req);
    const { layout, customized, departments } = await loadLayout(
      caller,
      preference,
      prefetched,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        version: PREFERENCES_VERSION,
        ...describe(caller, departments),
        layout,
        customized,
      },
    });
  } catch (error: unknown) {
    logger.error("getDashboard error:", { error });
    return handleError(res, error);
  }
}

/** PUT /dashboard/preferences — body: { version, widgets: LayoutEntry[] } */
export async function saveDashboardPreferences(
  req: AuthRequest,
  res: Response,
) {
  try {
    const caller = await resolveCaller(req);
    const body = req.body ?? {};
    if (body.version !== PREFERENCES_VERSION || !Array.isArray(body.widgets))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Unsupported dashboard layout.",
      });
    if (body.widgets.length > WIDGETS.length * 2)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Too many widgets.",
      });
    // Fresh: this validates a layout being saved.
    const departments = caller.capabilities.hr
      ? await activeDepartments(caller.tenantId, { fresh: true })
      : [];
    const layout = sanitizeLayout(body.widgets, caller.capabilities, {
      teams: caller.teams.map((t) => t.id),
      departments,
    });
    await prisma.dashboardPreference.upsert({
      where: {
        tenantId_userId: { tenantId: caller.tenantId, userId: caller.userId },
      },
      create: {
        tenantId: caller.tenantId,
        userId: caller.userId,
        version: PREFERENCES_VERSION,
        widgets: layout as any,
      },
      update: { version: PREFERENCES_VERSION, widgets: layout as any },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { layout, customized: true },
    });
  } catch (error: unknown) {
    logger.error("saveDashboardPreferences error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /dashboard/preferences */
export async function resetDashboardPreferences(
  req: AuthRequest,
  res: Response,
) {
  try {
    const caller = await resolveCaller(req);
    await prisma.dashboardPreference.deleteMany({
      where: { tenantId: caller.tenantId, userId: caller.userId },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { layout: defaultLayout(caller.capabilities), customized: false },
    });
  } catch (error: unknown) {
    logger.error("resetDashboardPreferences error:", { error });
    return handleError(res, error);
  }
}

// ── Widget data ─────────────────────────────────────────────────────────────

type Settings = Record<string, string | number>;
type Loader = (caller: Caller, settings: Settings) => Promise<unknown>;

const todayStart = () => dayjs.utc().startOf("day");
const nameOf = (u: any) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(" ") ||
  u?.username ||
  "Someone";
const personSelect = {
  id: true,
  username: true,
  first_name: true,
  last_name: true,
  designation: true,
} as const;

// One dashboard request runs many widgets at once and several read the same
// tenant-wide figure (active headcount, pending advances, settings). Each
// such read is shared within the request; nothing outlives it.
const requestMemo = new WeakMap<Caller, Map<string, Promise<unknown>>>();
function once<T>(caller: Caller, key: string, load: () => Promise<T>) {
  let memo = requestMemo.get(caller);
  if (!memo) requestMemo.set(caller, (memo = new Map()));
  if (!memo.has(key)) memo.set(key, load());
  return memo.get(key) as Promise<T>;
}
// Tenant-wide rows several widgets derive their figures from, read once per
// request instead of once per widget: the admin layout used to send ~13
// separate user, resignation and holiday reads. Each widget applies the
// filter it used to send to the database to these rows instead. Dates are
// compared via new Date()/dayjs so the rows may also come from JSON.
const rosterSelect = {
  ...personSelect,
  department: true,
  employeeStatus: true,
  joining_date: true,
  createdAt: true,
  dateOfTermination: true,
  dateOfAbscond: true,
  kyc_approval: true,
} as const;
// Tenant-wide reads are also shared across requests, briefly: the browser
// refreshes these widgets every 15 minutes and on focus at most once a
// minute, so a TTL of a minute or a few is not visible staleness. Each is
// keyed by the caller's tenant and read only after the widget's
// authorization check in getDashboardData; nothing viewer-specific is
// stored. Keys sit under existing families so the writes that already
// invalidate those families (employees:*, resignations:*) clear them too;
// writes that don't (bulk import, scheduler status jobs, joins) wait out
// the TTL.
function shared<T>(
  caller: Caller,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  return once(caller, `shared:${key}`, () =>
    cacheManager.getOrSet(`t:${caller.tenantId}:${key}`, load, {
      ttlSeconds,
    }),
  );
}
const utcDay = () => dayjs.utc().format("YYYY-MM-DD");

// Also read by the layout's department list before a Caller exists, so it is
// keyed by tenant id directly; both share one cache entry and one load.
const ROSTER_TTL = 60;
function rosterFor(tenantId: string, options: { fresh?: boolean } = {}) {
  return cacheManager.getOrSet(
    `t:${tenantId}:employees:dashboard:v1:roster`,
    () => prisma.user.findMany({ select: rosterSelect }),
    { ttlSeconds: ROSTER_TTL, fresh: options.fresh },
  );
}
const roster = (caller: Caller) =>
  once(caller, "roster", () => rosterFor(caller.tenantId));
/** Approved and Submitted resignations — every status a widget counts. */
const openResignations = (caller: Caller) =>
  shared(caller, "resignations:dashboard:v1:open", 60, () =>
    prisma.resignation.findMany({
      where: { status: { in: ["Approved", "Submitted"] } },
      select: {
        userId: true,
        status: true,
        lastWorkingDay: true,
        relievedFromDutyOn: true,
      },
    }),
  );
/**
 * Tenant-wide queue counts. Computed for everything and cached once per
 * tenant; each widget shows only the counts the viewer's capabilities allow.
 */
const queueCounts = (caller: Caller) =>
  shared(caller, "dashboard:v1:queue-counts", 60, async () => {
    const [tickets, breached, assetIssues, advances, joins] = await Promise.all(
      [
        prisma.ticket.count({
          where: { status: { in: ["open", "in_progress"] } },
        }),
        prisma.ticket.count({
          where: {
            slaBreached: true,
            status: { notIn: ["resolved", "closed"] },
          },
        }),
        prisma.assetIssue.count({ where: { status: "open" } }),
        prisma.salaryAdvance.count({ where: { status: "Pending" } }),
        masterPrisma.tenantJoinRequest.count({
          where: { tenantId: caller.tenantId, status: "pending" },
        }),
      ],
    );
    return { tickets, breached, assetIssues, advances, joins };
  });
const reviewCycles = (caller: Caller) =>
  shared(caller, "dashboard:v1:review-cycles", 300, () =>
    prisma.performanceReviewCycle.findMany({
      select: {
        id: true,
        name: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
    }),
  );
const disbursedRuns = (caller: Caller) =>
  shared(caller, "dashboard:v1:disbursed-runs", 300, () =>
    prisma.payrollRun.findMany({
      where: { status: "disbursed" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { id: true, month: true, year: true, disbursedAt: true },
      take: 24,
    }),
  );
/** A year's holidays from the shared holiday cache (see general.ts). */
const holidaysIn = (caller: Caller, year: number) =>
  once(caller, `holidays:${year}`, () => listHolidays(year));
const pendingJoinRequests = (caller: Caller) =>
  queueCounts(caller).then((c) => c.joins);

const timeOf = (d: unknown) =>
  d == null ? NaN : new Date(d as string | Date).getTime();
/** Inclusive range check, as Prisma's gte/lte (a missing date never matches). */
const within = (d: unknown, start: Date, end: Date) => {
  const t = timeOf(d);
  return t >= start.getTime() && t <= end.getTime();
};

const activeHeadcount = (caller: Caller) =>
  roster(caller).then(
    (people) => people.filter((p) => p.employeeStatus === "Active").length,
  );
const pendingAdvances = (caller: Caller) =>
  queueCounts(caller).then((c) => c.advances);
const tenantSettings = (caller: Caller) =>
  once(caller, "settings", () => getActiveSettings(caller.tenantId));

/** Whether today is a working day for the tenant (work week and holidays). */
async function dayType(
  caller: Caller,
): Promise<"working" | "weekoff" | "holiday"> {
  const today = todayStart();
  const [settings, list] = await Promise.all([
    tenantSettings(caller).catch(() => null),
    holidaysIn(caller, today.year()),
  ]);
  if (list.some((h) => h?.date === today.format("YYYY-MM-DD")))
    return "holiday";
  return getWorkingDays(settings).includes(today.day()) ? "working" : "weekoff";
}

/**
 * Today's status for a set of people: on leave (approved, covering today),
 * punched in / done, or not punched in yet. WFH is a flag on top. Never
 * "absent": the day isn't over and no shift times exist to judge lateness.
 */
async function statusToday(userIds: string[]) {
  return summarizeToday(userIds, await todayActivity(userIds));
}

/**
 * Today's attendance, approved leave and approved WFH rows — for the given
 * people, or for everyone (null) so the read needn't wait for the id list.
 * Each tenant has its own database, so "everyone" is this tenant only.
 */
async function todayActivity(userIds: string[] | null) {
  const start = todayStart().toDate();
  const end = todayStart().endOf("day").toDate();
  const who = userIds ? { userId: { in: userIds } } : {};
  const [records, leaves, wfh] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { ...who, date: start },
      select: { userId: true, timeIn: true, timeOut: true },
    }),
    prisma.leaveApplication.findMany({
      where: {
        ...who,
        status: "Approved",
        from: { lte: end },
        to: { gte: start },
      },
      select: { userId: true, leaveType: true, unit: true },
    }),
    prisma.wfhRequest.findMany({
      where: {
        ...who,
        status: "Approved",
        date: { lte: start },
        toDate: { gte: start },
      },
      select: { userId: true },
    }),
  ]);
  return { records, leaves, wfh };
}

function summarizeToday(
  userIds: string[],
  { records, leaves, wfh }: Awaited<ReturnType<typeof todayActivity>>,
) {
  const rec = new Map(records.map((r) => [r.userId, r]));
  const leave = new Map(leaves.map((l) => [l.userId, l]));
  const remote = new Set(wfh.map((w) => w.userId));
  return userIds.map((id) => {
    const r = rec.get(id);
    const l = leave.get(id);
    const fullDayLeave = l && (l.unit ?? "full_day") === "full_day";
    const status =
      fullDayLeave && !r?.timeIn
        ? "leave"
        : r?.timeIn
          ? r.timeOut
            ? "done"
            : "in"
          : "notIn";
    return {
      id,
      status: status as "leave" | "in" | "done" | "notIn",
      wfh: remote.has(id),
      since: r?.timeIn ?? null,
      leaveType: l?.leaveType ?? null,
      partialLeave: Boolean(l && !fullDayLeave),
    };
  });
}

function teamMemberIds(caller: Caller, team: string | number | undefined) {
  const teams =
    team && team !== "all"
      ? caller.teams.filter((t) => t.id === team)
      : caller.teams;
  return [...new Set(teams.flatMap((t) => t.members))];
}

const loaders: Record<string, Loader> = {
  "team-today": async (caller, s) => {
    const ids = teamMemberIds(caller, s.team);
    const [people, statuses, today] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids }, employeeStatus: "Active" },
        select: personSelect,
      }),
      statusToday(ids),
      dayType(caller),
    ]);
    const byId = new Map(statuses.map((x) => [x.id, x]));
    const members = people
      .map((p) => ({
        ...byId.get(p.id)!,
        username: p.username,
        name: nameOf(p),
        designation: p.designation ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const count = (k: string) => members.filter((m) => m.status === k).length;
    return {
      dayType: today,
      counts: {
        total: members.length,
        in: count("in") + count("done"),
        wfh: members.filter((m) => m.wfh && m.status !== "leave").length,
        leave: count("leave"),
        notIn: count("notIn"),
      },
      members,
    };
  },

  "team-leave": async (caller, s) => {
    const ids = teamMemberIds(caller, "all");
    const days = Number(s.days) || 14;
    const start = todayStart().toDate();
    const end = todayStart().add(days, "day").endOf("day").toDate();
    const leaves = await prisma.leaveApplication.findMany({
      where: {
        userId: { in: ids },
        status: { in: ["Approved", "Pending"] },
        from: { lte: end },
        to: { gte: start },
      },
      select: {
        id: true,
        userId: true,
        from: true,
        to: true,
        days: true,
        leaveType: true,
        status: true,
        unit: true,
      },
      orderBy: { from: "asc" },
      take: 30,
    });
    const people = await prisma.user.findMany({
      where: { id: { in: [...new Set(leaves.map((l) => l.userId))] } },
      select: personSelect,
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      days,
      items: leaves.map((l) => ({
        ...l,
        name: nameOf(byId.get(l.userId)),
        username: byId.get(l.userId)?.username,
      })),
    };
  },

  "org-today": async (caller, s) => {
    const where: any = { employeeStatus: "Active" };
    if (s.department && s.department !== "all") where.department = s.department;
    // People, today's activity and the day type are independent reads.
    const [people, activity, today] = await Promise.all([
      prisma.user.findMany({ where, select: { id: true } }),
      todayActivity(null),
      dayType(caller),
    ]);
    const ids = people.map((p) => p.id);
    const statuses = summarizeToday(ids, activity);
    const n = (k: string) => statuses.filter((x) => x.status === k).length;
    return {
      dayType: today,
      department: s.department ?? "all",
      counts: {
        total: ids.length,
        in: n("in") + n("done"),
        wfh: statuses.filter((x) => x.wfh && x.status !== "leave").length,
        leave: n("leave"),
        notIn: n("notIn"),
      },
    };
  },

  workforce: async (caller) => {
    const monthStart = dayjs.utc().startOf("month").toDate();
    const monthEnd = dayjs.utc().endOf("month").toDate();
    const [people, resignations] = await Promise.all([
      roster(caller),
      openResignations(caller),
    ]);
    const activePeople = people.filter((p) => p.employeeStatus === "Active");
    const active = activePeople.length;
    // Grouped by the stored value, as the groupBy this replaces did (so a
    // null and an empty department still come out as two entries).
    const perDepartment = new Map<string | null, number>();
    for (const p of activePeople) {
      const key = (p.department as string | null) ?? null;
      perDepartment.set(key, (perDepartment.get(key) ?? 0) + 1);
    }
    const joiners = people.filter((p) =>
      within(p.joining_date, monthStart, monthEnd),
    ).length;
    const leaving = resignations.filter(
      (r) =>
        r.status === "Approved" &&
        within(r.lastWorkingDay, monthStart, monthEnd),
    ).length;
    const departments = [...perDepartment]
      .map(([department, count]) => ({
        department: department || "Unassigned",
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      active,
      joinersThisMonth: joiners,
      leavingThisMonth: leaving,
      departments,
    };
  },

  "joiners-leavers": async (caller) => {
    const start = todayStart().toDate();
    const end = todayStart().add(30, "day").endOf("day").toDate();
    const [people, open] = await Promise.all([
      roster(caller),
      openResignations(caller),
    ]);
    const joining = caller.capabilities.hr
      ? people
          .filter((p) => within(p.joining_date, start, end))
          .sort((a, b) => timeOf(a.joining_date) - timeOf(b.joining_date))
          .slice(0, 8)
      : null;
    const resignations = open
      .filter(
        (r) => r.status === "Approved" && within(r.lastWorkingDay, start, end),
      )
      .sort((a, b) => timeOf(a.lastWorkingDay) - timeOf(b.lastWorkingDay))
      .slice(0, 8);
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      joining:
        joining?.map((p) => ({
          id: p.id,
          username: p.username,
          name: nameOf(p),
          designation: p.designation,
          department: p.department,
          date: p.joining_date,
        })) ?? null,
      leaving: resignations
        .filter((r) => r.userId && byId.has(r.userId))
        .map((r) => {
          const p = byId.get(r.userId!)!;
          return {
            id: p.id,
            username: p.username,
            name: nameOf(p),
            designation: p.designation,
            department: p.department,
            date: r.lastWorkingDay,
          };
        }),
    };
  },

  "hr-queue": async (caller) => {
    const c = caller.capabilities;
    const q = <T>(on: boolean, fn: () => Promise<T>) =>
      on ? fn() : Promise.resolve(null);
    const [kyc, exits, tickets, breached, assetIssues, advances, joins] =
      await Promise.all([
        q(c.kyc, () =>
          roster(caller).then(
            (people) =>
              people.filter((p) => p.kyc_approval === "Pending").length,
          ),
        ),
        q(c.exits, () =>
          openResignations(caller).then(
            (open) => open.filter((r) => r.status === "Submitted").length,
          ),
        ),
        q(c.helpdesk, () => queueCounts(caller).then((n) => n.tickets)),
        q(c.helpdesk, () => queueCounts(caller).then((n) => n.breached)),
        q(c.assets, () => queueCounts(caller).then((n) => n.assetIssues)),
        q(c.advances, () => pendingAdvances(caller)),
        q(c.joinRequests, () => pendingJoinRequests(caller)),
      ]);
    return { kyc, exits, tickets, breached, assetIssues, advances, joins };
  },

  "headcount-trend": async (caller, s) => {
    const months = Number(s.months) || 6;
    const [people, open] = await Promise.all([
      roster(caller),
      openResignations(caller),
    ]);
    const resignations = open.filter((r) => r.status === "Approved");
    const lwd = new Map(
      resignations.map((r) => [
        r.userId,
        r.relievedFromDutyOn ?? r.lastWorkingDay,
      ]),
    );
    let undated = 0;
    const spans = people.flatMap((p) => {
      const joined = p.joining_date ?? p.createdAt;
      if (!joined) return [];
      if (p.employeeStatus === "Active")
        return [{ joined, left: null as Date | null }];
      const left =
        p.dateOfTermination ?? p.dateOfAbscond ?? lwd.get(p.id) ?? null;
      if (!left) {
        undated++;
        return [];
      }
      return [{ joined, left }];
    });
    const series = Array.from({ length: months }, (_, i) => {
      const m = dayjs.utc().subtract(months - 1 - i, "month");
      const start = m.startOf("month");
      const end = m.endOf("month");
      const cutoff = i === months - 1 ? dayjs.utc() : end;
      const headcount = spans.filter(
        (x) =>
          !dayjs(x.joined).isAfter(cutoff) &&
          (!x.left || dayjs(x.left).isAfter(cutoff)),
      ).length;
      const joined = spans.filter(
        (x) =>
          !dayjs(x.joined).isBefore(start) && !dayjs(x.joined).isAfter(end),
      ).length;
      const exits = spans.filter(
        (x) =>
          x.left &&
          !dayjs(x.left).isBefore(start) &&
          !dayjs(x.left).isAfter(end),
      ).length;
      return { month: m.format("YYYY-MM"), headcount, joined, exits };
    });
    return { months, series, undatedExits: undated };
  },

  "attendance-trend": (caller, s) =>
    shared(
      caller,
      `dashboard:v1:attendance-trend:${Number(s.days) || 14}:${utcDay()}`,
      120,
      async () => {
        const days = Number(s.days) || 14;
        const start = todayStart().subtract(days - 1, "day");
        const years = [...new Set([start.year(), dayjs.utc().year()])];
        const [settings, records, active, holidayLists] = await Promise.all([
          tenantSettings(caller).catch(() => null),
          prisma.attendanceRecord.findMany({
            where: {
              date: { gte: start.toDate(), lte: todayStart().toDate() },
              timeIn: { not: null },
            },
            select: { date: true, userId: true },
          }),
          activeHeadcount(caller),
          Promise.all(years.map((y) => holidaysIn(caller, y))),
        ]);
        const working = getWorkingDays(settings);
        const holidays = new Set(holidayLists.flat().map((h: any) => h?.date));
        const perDay = new Map<string, Set<string>>();
        for (const r of records) {
          const k = dayjs.utc(r.date).format("YYYY-MM-DD");
          if (!perDay.has(k)) perDay.set(k, new Set());
          perDay.get(k)!.add(r.userId);
        }
        const series = Array.from({ length: days }, (_, i) =>
          start.add(i, "day"),
        )
          .filter(
            (d) =>
              working.includes(d.day()) &&
              !holidays.has(d.format("YYYY-MM-DD")),
          )
          .map((d) => {
            const k = d.format("YYYY-MM-DD");
            const attended = perDay.get(k)?.size ?? 0;
            return {
              date: k,
              attended,
              rate: active ? attended / active : 0,
              today: d.isSame(todayStart(), "day"),
            };
          });
        return { days, headcount: active, series };
      },
    ),

  hiring: (caller) =>
    shared(caller, "dashboard:v1:hiring", 300, async () => {
      const now = new Date();
      const week = dayjs().add(7, "day").toDate();
      const [openRoles, byStatus, interviews, offers] = await Promise.all([
        prisma.jobOpening.count({
          where: { status: { in: ["Active", "Open"] }, deletedOn: null },
        }),
        prisma.jobApplication.groupBy({
          by: ["status"],
          _count: { id: true },
        }),
        prisma.applicationStageEvent.findMany({
          where: { scheduledAt: { gte: now, lte: week }, completedAt: null },
          select: {
            id: true,
            stageName: true,
            scheduledAt: true,
            application: {
              select: {
                name: true,
                jobOpening: { select: { jobTitle: true } },
              },
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 6,
        }),
        prisma.offer.count({
          where: { status: { in: ["Sent", "Negotiating"] } },
        }),
      ]);
      return {
        openRoles,
        applications: byStatus
          .map((g: any) => ({
            status: g.status as string,
            count: g._count.id as number,
          }))
          .sort((a, b) => b.count - a.count),
        interviews: interviews.map((e: any) => ({
          id: e.id,
          stage: e.stageName,
          at: e.scheduledAt,
          candidate: e.application?.name ?? "Candidate",
          role: e.application?.jobOpening?.jobTitle ?? null,
        })),
        offersOut: offers,
      };
    }),

  payroll: async (caller) => {
    const [{ latest, open }, advances] = await Promise.all([
      shared(caller, "dashboard:v1:payroll", 120, async () => {
        const [latest, open] = await Promise.all([
          prisma.payrollRun.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: {
              id: true,
              month: true,
              year: true,
              status: true,
              employeeCount: true,
              totalGross: true,
              totalNet: true,
              approvedAt: true,
              disbursedAt: true,
            },
          }),
          prisma.payrollRun.count({
            where: { status: { in: ["draft", "approved"] } },
          }),
        ]);
        return { latest, open };
      }),
      caller.capabilities.advances
        ? pendingAdvances(caller)
        : Promise.resolve(null),
    ]);
    return { latest, openRuns: open, pendingAdvances: advances };
  },

  "review-cycle": (caller) =>
    shared(caller, "dashboard:v1:review-cycle", 300, async () => {
      const active = (await reviewCycles(caller))
        .filter((c) => c.status === "active")
        .sort((a, b) => timeOf(a.periodEnd) - timeOf(b.periodEnd));
      const cycle = active[0]
        ? {
            id: active[0].id,
            name: active[0].name,
            periodStart: active[0].periodStart,
            periodEnd: active[0].periodEnd,
          }
        : null;
      if (!cycle) return { cycle: null, statuses: [] };
      const groups = await prisma.performanceReview.groupBy({
        by: ["status"],
        where: { cycleId: cycle.id },
        _count: { id: true },
      });
      return {
        cycle,
        statuses: groups.map((g: any) => ({
          status: g.status,
          count: g._count.id,
        })),
      };
    }),

  "org-admin": async (caller) => {
    const c = caller.capabilities;
    const [joins, tenant, seats] = await Promise.all([
      c.joinRequests ? pendingJoinRequests(caller) : Promise.resolve(null),
      c.subscription
        ? masterPrisma.tenant.findUnique({
            where: { id: caller.tenantId },
            select: {
              planTier: true,
              billing: true,
              subscriptionStatus: true,
              planExpiresAt: true,
              pendingPlanTier: true,
            },
          })
        : Promise.resolve(null),
      c.subscription ? getSeatStatus(caller.tenantId) : Promise.resolve(null),
    ]);
    return {
      joinRequests: joins,
      subscription: tenant
        ? {
            ...tenant,
            seatsUsed: seats?.activeCount ?? null,
            seatLimit: seats?.limit ?? null,
          }
        : null,
    };
  },

  "leave-balance": async (caller) => {
    const [balance, upcoming] = await Promise.all([
      grpcCall(leaveClient, "getLeaveBalance", {
        userId: caller.userId,
      }) as Promise<any>,
      prisma.leaveApplication.findMany({
        where: {
          userId: caller.userId,
          status: { in: ["Approved", "Pending"] },
          to: { gte: todayStart().toDate() },
        },
        select: {
          id: true,
          from: true,
          to: true,
          days: true,
          leaveType: true,
          status: true,
          unit: true,
        },
        orderBy: { from: "asc" },
        take: 3,
      }),
    ]);
    let types: { key: string; name: string; remaining: number }[] = [];
    try {
      const parsed = JSON.parse(balance?.data?.balances || "{}");
      types = Object.entries(parsed).map(([key, v]: [string, any]) => ({
        key,
        name: v?.name ?? key,
        remaining: Number(v?.remaining ?? 0),
      }));
    } catch {
      types = [];
    }
    return { types, upcoming };
  },

  "my-requests": async (caller) => {
    const me = caller.userId;
    const [leaves, wfh, tickets, advances] = await Promise.all([
      prisma.leaveApplication.findMany({
        where: {
          userId: me,
          status: { in: ["Pending", "Cancellation Requested"] },
        },
        select: {
          id: true,
          from: true,
          to: true,
          leaveType: true,
          status: true,
          appliedOn: true,
        },
        orderBy: { from: "asc" },
        take: 5,
      }),
      prisma.wfhRequest.findMany({
        where: { userId: me, status: "Pending" },
        select: { id: true, date: true, toDate: true, status: true },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.ticket.findMany({
        where: { raisedBy: me, status: { notIn: ["resolved", "closed"] } },
        select: {
          id: true,
          ticketNo: true,
          title: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.salaryAdvance.findMany({
        where: { userId: me, status: "Pending" },
        select: { id: true, amount: true, status: true, createdAt: true },
        take: 3,
      }),
    ]);
    return { leaves, wfh, tickets, advances };
  },

  "my-reviews": async (caller) => {
    const me = caller.userId;
    const [mine, toReview] = await Promise.all([
      prisma.performanceReview.findMany({
        where: { userId: me, status: { not: "finalized" } },
        select: { id: true, cycleId: true, status: true },
        take: 3,
      }),
      prisma.performanceReview.findMany({
        where: { reviewerId: me, status: "self_assessment_submitted" },
        select: { id: true, cycleId: true, userId: true, status: true },
        take: 8,
      }),
    ]);
    const cycleIds = [...new Set([...mine, ...toReview].map((r) => r.cycleId))];
    const reviewees = new Set(toReview.map((r) => r.userId));
    const wanted = new Set(cycleIds);
    const [cycles, people] = await Promise.all([
      reviewCycles(caller).then((all) => all.filter((c) => wanted.has(c.id))),
      roster(caller).then((all) => all.filter((p) => reviewees.has(p.id))),
    ]);
    const cycle = new Map(cycles.map((c) => [c.id, c]));
    const person = new Map(people.map((p) => [p.id, p]));
    const active = (id: string) => cycle.get(id)?.status === "active";
    return {
      mine: mine
        .filter((r) => active(r.cycleId))
        .map((r) => ({
          ...r,
          cycle: cycle.get(r.cycleId)?.name,
          due: cycle.get(r.cycleId)?.periodEnd,
        })),
      toReview: toReview
        .filter((r) => active(r.cycleId))
        .map((r) => ({
          id: r.id,
          cycle: cycle.get(r.cycleId)?.name,
          name: nameOf(person.get(r.userId)),
          username: person.get(r.userId)?.username,
        })),
    };
  },

  payslip: async (caller) => {
    const runs = await disbursedRuns(caller);
    if (runs.length === 0) return { latest: null };
    const lines = await prisma.payrollLineItem.findMany({
      where: {
        userId: caller.userId,
        payrollRunId: { in: runs.map((r) => r.id) },
      },
      select: {
        payrollRunId: true,
        netPayable: true,
        grossSalary: true,
        totalDeductions: true,
      },
    });
    if (lines.length === 0) return { latest: null };
    // The newest disbursed run this person was paid in (runs are newest first).
    const rank = new Map(runs.map((r, i) => [r.id, i]));
    const newest = lines.sort(
      (a, b) =>
        (rank.get(a.payrollRunId) ?? 99) - (rank.get(b.payrollRunId) ?? 99),
    )[0];
    const run = runs.find((r) => r.id === newest.payrollRunId)!;
    return {
      latest: {
        month: run.month,
        year: run.year,
        paidOn: run.disbursedAt,
        net: newest.netPayable,
        gross: newest.grossSalary,
        deductions: newest.totalDeductions,
      },
    };
  },
};

/** GET /dashboard/data?ids=a,b,c */
export async function getDashboardData(req: AuthRequest, res: Response) {
  try {
    markHandlerStart();
    // Optional cap on this request's concurrent reads (unset = unbounded);
    // see docs/performance/targeted-api-latency-investigation.md.
    limitReads(Number(process.env.DASHBOARD_MAX_INFLIGHT_READS) || null);
    const requested = String(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, WIDGETS.length);
    const [caller, preference, prefetched] =
      await resolveCallerAndPreference(req);
    const { layout } = await loadLayout(caller, preference, prefetched);
    const settingsFor = new Map(layout.map((e) => [e.id, e.settings]));

    const results = await Promise.all(
      requested.map(async (id) => {
        const spec = WIDGET_BY_ID.get(id);
        if (!spec || spec.source !== "server")
          return [id, { ok: false, error: "unknown" }] as const;
        if (!isAuthorized(spec, caller.capabilities))
          return [id, { ok: false, error: "forbidden" }] as const;
        try {
          const data = await loaders[id](caller, settingsFor.get(id) ?? {});
          return [
            id,
            { ok: true, data, settings: settingsFor.get(id) ?? {} },
          ] as const;
        } catch (error) {
          logger.error("dashboard widget failed", { id, error });
          return [id, { ok: false, error: "failed" }] as const;
        }
      }),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        widgets: Object.fromEntries(results),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error("getDashboardData error:", { error });
    return handleError(res, error);
  }
}

export const __test = { loaders };
