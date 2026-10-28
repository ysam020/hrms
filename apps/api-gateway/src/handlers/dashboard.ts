import { Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  prisma as masterPrisma,
  prismaWithTenant as prisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
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
    prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperUser: true, permissions: true },
    }),
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

async function activeDepartments(): Promise<string[]> {
  const groups = await prisma.user.groupBy({
    by: ["department"],
    where: { employeeStatus: "Active", department: { not: null } },
  });
  return groups
    .map((g: any) => g.department as string)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function loadLayout(caller: Caller): Promise<{
  layout: LayoutEntry[];
  customized: boolean;
  departments: string[];
}> {
  const [row, departments] = await Promise.all([
    prisma.dashboardPreference.findUnique({
      where: {
        tenantId_userId: { tenantId: caller.tenantId, userId: caller.userId },
      },
    }),
    caller.capabilities.hr ? activeDepartments() : Promise.resolve([]),
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
    const caller = await resolveCaller(req);
    const { layout, customized, departments } = await loadLayout(caller);
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
    const departments = caller.capabilities.hr ? await activeDepartments() : [];
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

/** Whether today is a working day for the tenant (work week and holidays). */
async function dayType(
  tenantId: string,
): Promise<"working" | "weekoff" | "holiday"> {
  const today = todayStart();
  const [settings, holidayDoc] = await Promise.all([
    getActiveSettings(tenantId).catch(() => null),
    prisma.holiday.findFirst({
      where: { year: today.year(), month: today.month() + 1 },
    }),
  ]);
  const list: any[] = Array.isArray(holidayDoc?.holidays)
    ? (holidayDoc!.holidays as any[])
    : [];
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
  const start = todayStart().toDate();
  const end = todayStart().endOf("day").toDate();
  const [records, leaves, wfh] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { userId: { in: userIds }, date: start },
      select: { userId: true, timeIn: true, timeOut: true },
    }),
    prisma.leaveApplication.findMany({
      where: {
        userId: { in: userIds },
        status: "Approved",
        from: { lte: end },
        to: { gte: start },
      },
      select: { userId: true, leaveType: true, unit: true },
    }),
    prisma.wfhRequest.findMany({
      where: {
        userId: { in: userIds },
        status: "Approved",
        date: { lte: start },
        toDate: { gte: start },
      },
      select: { userId: true },
    }),
  ]);
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
      dayType(caller.tenantId),
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
    const people = await prisma.user.findMany({ where, select: { id: true } });
    const ids = people.map((p) => p.id);
    const [statuses, today] = await Promise.all([
      statusToday(ids),
      dayType(caller.tenantId),
    ]);
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

  workforce: async () => {
    const monthStart = dayjs.utc().startOf("month").toDate();
    const monthEnd = dayjs.utc().endOf("month").toDate();
    const [active, depts, joiners, leaving] = await Promise.all([
      prisma.user.count({ where: { employeeStatus: "Active" } }),
      prisma.user.groupBy({
        by: ["department"],
        where: { employeeStatus: "Active" },
        _count: { id: true },
      }),
      prisma.user.count({
        where: { joining_date: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.resignation.count({
        where: {
          status: "Approved",
          lastWorkingDay: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);
    const departments = depts
      .map((d: any) => ({
        department: d.department || "Unassigned",
        count: d._count.id as number,
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
    const [joining, resignations] = await Promise.all([
      caller.capabilities.hr
        ? prisma.user.findMany({
            where: { joining_date: { gte: start, lte: end } },
            select: { ...personSelect, department: true, joining_date: true },
            orderBy: { joining_date: "asc" },
            take: 8,
          })
        : Promise.resolve(null),
      prisma.resignation.findMany({
        where: { status: "Approved", lastWorkingDay: { gte: start, lte: end } },
        select: { userId: true, lastWorkingDay: true },
        orderBy: { lastWorkingDay: "asc" },
        take: 8,
      }),
    ]);
    const leavers = await prisma.user.findMany({
      where: { id: { in: resignations.map((r) => r.userId!).filter(Boolean) } },
      select: { ...personSelect, department: true },
    });
    const byId = new Map(leavers.map((p) => [p.id, p]));
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
          prisma.user.count({ where: { kyc_approval: "Pending" } }),
        ),
        q(c.exits, () =>
          prisma.resignation.count({ where: { status: "Submitted" } }),
        ),
        q(c.helpdesk, () =>
          prisma.ticket.count({
            where: { status: { in: ["open", "in_progress"] } },
          }),
        ),
        q(c.helpdesk, () =>
          prisma.ticket.count({
            where: {
              slaBreached: true,
              status: { notIn: ["resolved", "closed"] },
            },
          }),
        ),
        q(c.assets, () =>
          prisma.assetIssue.count({ where: { status: "open" } }),
        ),
        q(c.advances, () =>
          prisma.salaryAdvance.count({ where: { status: "Pending" } }),
        ),
        q(c.joinRequests, () =>
          masterPrisma.tenantJoinRequest.count({
            where: { tenantId: caller.tenantId, status: "pending" },
          }),
        ),
      ]);
    return { kyc, exits, tickets, breached, assetIssues, advances, joins };
  },

  "headcount-trend": async (_caller, s) => {
    const months = Number(s.months) || 6;
    const [people, resignations] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          employeeStatus: true,
          joining_date: true,
          createdAt: true,
          dateOfTermination: true,
          dateOfAbscond: true,
        },
      }),
      prisma.resignation.findMany({
        where: { status: "Approved" },
        select: {
          userId: true,
          lastWorkingDay: true,
          relievedFromDutyOn: true,
        },
      }),
    ]);
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

  "attendance-trend": async (caller, s) => {
    const days = Number(s.days) || 14;
    const start = todayStart().subtract(days - 1, "day");
    const [settings, records, active, holidayDocs] = await Promise.all([
      getActiveSettings(caller.tenantId).catch(() => null),
      prisma.attendanceRecord.findMany({
        where: {
          date: { gte: start.toDate(), lte: todayStart().toDate() },
          timeIn: { not: null },
        },
        select: { date: true, userId: true },
      }),
      prisma.user.count({ where: { employeeStatus: "Active" } }),
      prisma.holiday.findMany({
        where: {
          year: { in: [...new Set([start.year(), dayjs.utc().year()])] },
        },
      }),
    ]);
    const working = getWorkingDays(settings);
    const holidays = new Set(
      holidayDocs.flatMap((d: any) =>
        (Array.isArray(d.holidays) ? d.holidays : []).map((h: any) => h?.date),
      ),
    );
    const perDay = new Map<string, Set<string>>();
    for (const r of records) {
      const k = dayjs.utc(r.date).format("YYYY-MM-DD");
      if (!perDay.has(k)) perDay.set(k, new Set());
      perDay.get(k)!.add(r.userId);
    }
    const series = Array.from({ length: days }, (_, i) => start.add(i, "day"))
      .filter(
        (d) =>
          working.includes(d.day()) && !holidays.has(d.format("YYYY-MM-DD")),
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

  hiring: async () => {
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
            select: { name: true, jobOpening: { select: { jobTitle: true } } },
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
  },

  payroll: async (caller) => {
    const [latest, open, advances] = await Promise.all([
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
      caller.capabilities.advances
        ? prisma.salaryAdvance.count({ where: { status: "Pending" } })
        : Promise.resolve(null),
    ]);
    return { latest, openRuns: open, pendingAdvances: advances };
  },

  "review-cycle": async () => {
    const cycle = await prisma.performanceReviewCycle.findFirst({
      where: { status: "active" },
      orderBy: { periodEnd: "asc" },
      select: { id: true, name: true, periodStart: true, periodEnd: true },
    });
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
  },

  "org-admin": async (caller) => {
    const c = caller.capabilities;
    const [joins, tenant, seats] = await Promise.all([
      c.joinRequests
        ? masterPrisma.tenantJoinRequest.count({
            where: { tenantId: caller.tenantId, status: "pending" },
          })
        : Promise.resolve(null),
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
    const [cycles, people] = await Promise.all([
      prisma.performanceReviewCycle.findMany({
        where: { id: { in: cycleIds } },
        select: { id: true, name: true, periodEnd: true, status: true },
      }),
      prisma.user.findMany({
        where: { id: { in: toReview.map((r) => r.userId) } },
        select: personSelect,
      }),
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
    const runs = await prisma.payrollRun.findMany({
      where: { status: "disbursed" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { id: true, month: true, year: true, disbursedAt: true },
      take: 24,
    });
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
    const requested = String(req.query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, WIDGETS.length);
    const caller = await resolveCaller(req);
    const { layout } = await loadLayout(caller);
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
