/**
 * Praesto Platform Console (/platform/admin/*) — cross-tenant SaaS
 * administration for Praesto's own team, behind authenticate +
 * requirePlatformAdmin(<action>) on every route (routes/platformAdmin.ts).
 *
 * Data sources (all master DB unless noted; see docs/platform-admin.md):
 *  - tenants: subscription/trial state, registration date, account flag
 *  - users: employee records, counted with one groupBy (never loaded)
 *  - tenant_memberships: user accounts per organisation
 *  - login_events: last sign-in and active organisations
 *  - billing_payments: the Razorpay payment ledger (services/billingLedger)
 *  - one tenant's own DB, on the tenant detail page only: module usage counts
 *
 * Read-only except the two audited "Sync from Razorpay" actions, which run
 * the same reconciliation the 6-hourly job does. No HR records (KYC, salary,
 * personal details) are read; employees appear only as counts.
 */
import { Request, Response } from "express";
import { prisma, prismaWithTenant, getClientForDb } from "@hrms/db";
import { getRedisClient } from "@hrms/cache";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { AuthRequest } from "../middleware/authenticate";
import { platformTenantId } from "../config/platform";
import { getRazorpay } from "./payment";
import {
  RECONCILE_SELECT,
  reconcileTenant,
} from "../services/subscriptionReconciler";
import { syncTenantLedger } from "../services/billingLedger";
import type { PlatformAdminAction } from "../services/platformAccess";
import {
  arpa,
  billedMrrAt,
  billingOf,
  bucketKey,
  bucketKeys,
  collections,
  growth,
  hasAccess,
  hasPaid,
  isPaying,
  istDate,
  monthlyValuePaise,
  mrrSummary,
  netBy,
  resolveRange,
  series,
  subscriptionCounts,
  tierOf,
  trialConversion,
  type DateRange,
  type PaymentRow,
  type TenantRow,
} from "../services/platformMetrics";

const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const AUDIT_ENTITY = "PlatformAdmin";

type PlatformRequest = AuthRequest & { platformGrants?: PlatformAdminAction[] };
const grants = (req: Request) => (req as PlatformRequest).platformGrants ?? [];
const canSeeBilling = (req: Request) => grants(req).includes("view_billing");

function fail(res: Response, where: string, error: unknown) {
  logger.error(`platformAdmin.${where} error:`, { error });
  return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
    message: "Couldn't load platform data. Try again.",
  });
}

// ── Loaders ─────────────────────────────────────────────────────────────────

const TENANT_FIELDS = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  isActive: true,
  subscriptionStatus: true,
  planTier: true,
  billing: true,
  planActivatedAt: true,
  planExpiresAt: true,
  trialStartedAt: true,
  trialEndsAt: true,
  razorpaySubscriptionId: true,
  pendingPlanTier: true,
  pendingBilling: true,
} as const;

/** Customer organisations: every tenant except Praesto's own. */
async function loadCustomers(): Promise<TenantRow[]> {
  const platform = platformTenantId();
  return (await prisma.tenant.findMany({
    where: platform ? { id: { not: platform } } : {},
    select: TENANT_FIELDS,
  })) as TenantRow[];
}

/** tenantId → employee records (all statuses) and Active ones. */
async function employeeCounts() {
  const groups = await prisma.user.groupBy({
    by: ["tenantId", "employeeStatus"],
    where: { tenantId: { not: null } },
    _count: { _all: true },
  });
  const out = new Map<string, { total: number; active: number }>();
  for (const g of groups as any[]) {
    const c = out.get(g.tenantId) ?? { total: 0, active: 0 };
    c.total += g._count._all;
    if (g.employeeStatus === "Active") c.active += g._count._all;
    out.set(g.tenantId, c);
  }
  return out;
}

async function memberCounts() {
  const groups = await prisma.tenantMembership.groupBy({
    by: ["tenantId"],
    _count: { _all: true },
  });
  return new Map((groups as any[]).map((g) => [g.tenantId, g._count._all]));
}

/** tenantId → most recent sign-in by any of its members. */
async function lastSignIns(where: Record<string, unknown> = {}) {
  const groups = await prisma.loginEvent.groupBy({
    by: ["tenantId"],
    where: { tenantId: { not: null }, ...where },
    _max: { timestamp: true },
  });
  return new Map(
    (groups as any[]).map((g) => [g.tenantId as string, g._max.timestamp]),
  );
}

// aggregateRaw returns extended JSON ({$oid}, {$date}).
const ejsonId = (v: any): string => (v && v.$oid) || String(v);
const ejsonDate = (v: any): Date | null =>
  v == null ? null : new Date(v.$date ?? v);

/** tenantId → its most recent ledger payment. */
async function latestPayments() {
  const rows = (await prisma.billingPayment.aggregateRaw({
    pipeline: [
      { $sort: { tenantId: 1, paidAt: -1 } },
      {
        $group: {
          _id: "$tenantId",
          status: { $first: "$status" },
          amountRefunded: { $first: "$amountRefunded" },
          paidAt: { $first: "$paidAt" },
        },
      },
    ],
  })) as unknown as any[];
  return new Map(
    rows.map((r) => [
      ejsonId(r._id),
      {
        status: paymentState(r.status, Number(r.amountRefunded) || 0),
        paidAt: ejsonDate(r.paidAt),
      },
    ]),
  );
}

/** Ledger status as the console shows it: refunds are their own state. */
const paymentState = (status: string, amountRefunded: number) =>
  amountRefunded > 0 && (status === "captured" || status === "refunded")
    ? "refunded"
    : status === "created" || status === "authorized"
      ? "pending"
      : status;

const PAYMENT_FIELDS = {
  tenantId: true,
  amount: true,
  currency: true,
  status: true,
  amountRefunded: true,
  planTier: true,
  billing: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
} as const;

async function customerPayments(from: Date, to: Date): Promise<PaymentRow[]> {
  const platform = platformTenantId();
  return (await prisma.billingPayment.findMany({
    where: {
      paidAt: { gte: from, lt: to },
      ...(platform && { tenantId: { not: platform } }),
    },
    select: PAYMENT_FIELDS,
  })) as PaymentRow[];
}

/** Employee records created per bucket, grouped in the database. */
async function employeesAdded(range: DateRange) {
  const platform = platformTenantId();
  const format = range.bucket === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = (await prisma.user.aggregateRaw({
    pipeline: [
      {
        $match: {
          createdAt: {
            $gte: { $date: range.from.toISOString() },
            $lt: { $date: range.to.toISOString() },
          },
          tenantId: {
            $exists: true,
            $nin: [null, ...(platform ? [{ $oid: platform }] : [])],
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format,
              timezone: "Asia/Kolkata",
              date: {
                $dateTrunc: {
                  date: "$createdAt",
                  unit: range.bucket,
                  timezone: "Asia/Kolkata",
                  startOfWeek: "monday",
                },
              },
            },
          },
          n: { $sum: 1 },
        },
      },
    ],
  })) as unknown as { _id: string; n: number }[];
  const counts = new Map(rows.map((r) => [r._id, Number(r.n) || 0]));
  return bucketKeys(range).map((key) => ({
    key,
    value: counts.get(key) ?? 0,
  }));
}

async function usersCreatedBetween(from: Date, to: Date) {
  const platform = platformTenantId();
  return prisma.user.count({
    where: {
      createdAt: { gte: from, lt: to },
      tenantId: platform ? { not: platform } : { not: null },
    },
  });
}

const rangeOut = (r: DateRange) => ({
  from: r.from,
  to: r.to,
  prevFrom: r.prevFrom,
  prevTo: r.prevTo,
  bucket: r.bucket,
});

function earliest(tenants: TenantRow[]): Date | null {
  return tenants.reduce<Date | null>(
    (min, t) => (!min || t.createdAt < min ? t.createdAt : min),
    null,
  );
}

async function ledgerCoverage() {
  const [count, first] = await Promise.all([
    prisma.billingPayment.count(),
    prisma.billingPayment.findFirst({
      orderBy: { paidAt: "asc" },
      select: { paidAt: true },
    }),
  ]);
  return { payments: count, earliestPaymentAt: first?.paidAt ?? null };
}

// Metrics the data can't support today — listed, never estimated.
const UNAVAILABLE = [
  {
    metric: "Churn and renewal rate",
    reason:
      "Tenants record only their current subscription status, not when it changed, so past cancellations and lapses can't be dated.",
  },
  {
    metric: "Revenue churn",
    reason:
      "Needs dated plan changes and cancellations; only the current plan and a pending change are stored.",
  },
  {
    metric: "Historical employee counts",
    reason:
      "Employee records keep their current status only; the trend shows records added, not headcount at each date.",
  },
  {
    metric: "Acquisition source",
    reason: "Sign-up source isn't captured.",
  },
  {
    metric: "Per-module feature usage across tenants",
    reason:
      "No usage telemetry exists; module activity is read per tenant on its detail page only.",
  },
];

// ── Overview ────────────────────────────────────────────────────────────────

/** GET /platform/admin/overview?range=|from=&to= */
export async function getOverview(req: Request, res: Response) {
  try {
    const now = new Date();
    const tenants = await loadCustomers();
    const range = resolveRange(req.query as any, now, earliest(tenants));
    const withBilling = canSeeBilling(req);

    const [employees, members, signedIn, addedSeries, addedNow, addedPrev] =
      await Promise.all([
        employeeCounts(),
        memberCounts(),
        lastSignIns({ timestamp: { gte: range.from, lt: range.to } }),
        employeesAdded(range),
        usersCreatedBetween(range.from, range.to),
        usersCreatedBetween(range.prevFrom, range.prevTo),
      ]);

    const ids = new Set(tenants.map((t) => t.id));
    let records = 0;
    let active = 0;
    let activeInAccessTenants = 0;
    for (const t of tenants) {
      const c = employees.get(t.id);
      if (!c) continue;
      records += c.total;
      active += c.active;
      if (hasAccess(t)) activeInAccessTenants += c.active;
    }
    let userAccounts = 0;
    for (const [tid, n] of members) if (ids.has(tid)) userAccounts += n;

    const newNow = tenants.filter(
      (t) => t.createdAt >= range.from && t.createdAt < range.to,
    ).length;
    const newPrev = tenants.filter(
      (t) => t.createdAt >= range.prevFrom && t.createdAt < range.prevTo,
    ).length;
    const withAccess = tenants.filter(hasAccess).length;
    const signedInCount = [...signedIn.keys()].filter((id) =>
      ids.has(id),
    ).length;

    let billing: Record<string, unknown> | null = null;
    if (withBilling) {
      const [payments, prevPayments, periodPayments, coverage] =
        await Promise.all([
          customerPayments(range.from, range.to),
          customerPayments(range.prevFrom, range.prevTo),
          // Annual periods start up to a year before the instants we measure.
          customerPayments(new Date(now.getTime() - 400 * DAY_MS), now),
          ledgerCoverage(),
        ]);
      const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
      billing = {
        mrr: mrrSummary(tenants, now),
        billedMrr: {
          now: billedMrrAt(periodPayments, now),
          thirtyDaysAgo: billedMrrAt(periodPayments, monthAgo),
          growth: growth(
            billedMrrAt(periodPayments, now),
            billedMrrAt(periodPayments, monthAgo),
          ),
        },
        collections: collections(payments),
        previousCollections: collections(prevPayments),
        // INR only: one chart can't honestly mix currencies.
        netSeries: series(
          payments.filter((p) => p.currency === "INR"),
          range,
          (p) => p.paidAt,
          (p) =>
            p.status === "captured" || p.status === "refunded"
              ? p.amount - Math.min(p.amountRefunded, p.amount)
              : 0,
        ),
        paymentSeries: {
          successful: series(
            payments.filter(
              (p) => p.status === "captured" || p.status === "refunded",
            ),
            range,
            (p) => p.paidAt,
          ),
          failed: series(
            payments.filter((p) => p.status === "failed"),
            range,
            (p) => p.paidAt,
          ),
        },
        ledger: coverage,
      };
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        range: rangeOut(range),
        generatedAt: now,
        tenants: {
          total: tenants.length,
          newInRange: newNow,
          newPrevious: newPrev,
          growth: growth(newNow, newPrev),
          withAccess,
          withoutAccess: tenants.length - withAccess,
          accountActive: tenants.filter((t) => t.isActive).length,
          accountInactive: tenants.filter((t) => !t.isActive).length,
          signedInInRange: signedInCount,
          registrations: series(tenants, range, (t) => t.createdAt),
        },
        employees: {
          records,
          active,
          inactive: records - active,
          activeInTenantsWithAccess: activeInAccessTenants,
          averagePerTenant: tenants.length
            ? Math.round((records / tenants.length) * 10) / 10
            : 0,
          userAccounts,
          addedInRange: addedNow,
          addedPrevious: addedPrev,
          growth: growth(addedNow, addedPrev),
          added: addedSeries,
        },
        subscriptions: subscriptionCounts(tenants, now),
        trials: trialConversion(tenants, range.from, range.to, now),
        conversions: series(
          tenants.filter((t) => t.trialStartedAt),
          range,
          (t) => t.planActivatedAt,
        ),
        billing,
        unavailable: UNAVAILABLE,
      },
    });
  } catch (error) {
    return fail(res, "getOverview", error);
  }
}

// ── Tenants ─────────────────────────────────────────────────────────────────

const kindOf = (t: TenantRow) =>
  hasPaid(t) ? "paid" : t.trialStartedAt ? "trial" : "never_paid";

/**
 * GET /platform/admin/tenants — filtered, sorted, paginated on the server.
 * Filters that depend on counts (employees, latest payment) are applied
 * after one aggregation each, over the customer list's projection.
 */
export async function listTenants(req: Request, res: Response) {
  try {
    const q = req.query as any;
    if (q.payment && !canSeeBilling(req))
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Filtering by payment needs billing access.",
      });
    const now = new Date();
    const withBilling = canSeeBilling(req);
    const [tenants, employees, members, signIns, payments] = await Promise.all([
      loadCustomers(),
      employeeCounts(),
      memberCounts(),
      lastSignIns(),
      withBilling ? latestPayments() : Promise.resolve(new Map()),
    ]);

    const term = String(q.search ?? "").toLowerCase();
    const regFrom = q.registeredFrom ? istDate(q.registeredFrom) : null;
    const regTo = q.registeredTo
      ? new Date(istDate(q.registeredTo).getTime() + DAY_MS)
      : null;

    let rows = tenants
      .map((t) => {
        const e = employees.get(t.id) ?? { total: 0, active: 0 };
        const p = payments.get(t.id) ?? null;
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          createdAt: t.createdAt,
          isActive: t.isActive,
          subscriptionStatus: t.subscriptionStatus,
          planTier: tierOf(t),
          billing: billingOf(t),
          kind: kindOf(t),
          hasAccess: hasAccess(t),
          planActivatedAt: t.planActivatedAt,
          planExpiresAt: t.planExpiresAt,
          trialEndsAt: t.trialEndsAt,
          employees: e.total,
          activeEmployees: e.active,
          members: members.get(t.id) ?? 0,
          lastSignInAt: signIns.get(t.id) ?? null,
          latestPayment: withBilling ? p : undefined,
        };
      })
      .filter(
        (r) =>
          (!term ||
            r.name.toLowerCase().includes(term) ||
            r.slug.toLowerCase().includes(term) ||
            r.id === term) &&
          (!q.status || r.subscriptionStatus === q.status) &&
          (!q.plan || r.planTier === q.plan) &&
          (!q.kind || r.kind === q.kind) &&
          (!q.account || r.isActive === (q.account === "active")) &&
          (!q.access || r.hasAccess === (q.access === "yes")) &&
          (!regFrom || r.createdAt >= regFrom) &&
          (!regTo || r.createdAt < regTo) &&
          (q.minEmployees == null || r.employees >= q.minEmployees) &&
          (q.maxEmployees == null || r.employees <= q.maxEmployees) &&
          (!q.payment ||
            (q.payment === "none"
              ? !r.latestPayment
              : r.latestPayment?.status === q.payment)),
      );

    const by: Record<string, (a: any, b: any) => number> = {
      created_desc: (a, b) => +b.createdAt - +a.createdAt,
      created_asc: (a, b) => +a.createdAt - +b.createdAt,
      name_asc: (a, b) => a.name.localeCompare(b.name),
      employees_desc: (a, b) => b.employees - a.employees,
      renewal_asc: (a, b) =>
        (a.planExpiresAt ? +a.planExpiresAt : Infinity) -
        (b.planExpiresAt ? +b.planExpiresAt : Infinity),
    };
    rows = rows.sort(by[q.sort] ?? by.created_desc);
    const total = rows.length;
    const page = rows.slice((q.page - 1) * q.limit, q.page * q.limit);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        tenants: page,
        totalCount: total,
        page: q.page,
        generatedAt: now,
      },
    });
  } catch (error) {
    return fail(res, "listTenants", error);
  }
}

/** Counts of recent activity in one tenant's own database (no records). */
async function moduleUsage(dbName: string, since: Date) {
  const db: any = getClientForDb(dbName);
  const count = (model: string, where: object) =>
    db[model].count({ where }).catch(() => null);
  const [attendance, leave, jobs, payroll, helpdesk] = await Promise.all([
    count("attendanceRecord", { date: { gte: since } }),
    count("leaveApplication", { from: { gte: since } }),
    count("jobOpening", { createdOn: { gte: since } }),
    count("payrollRun", { createdAt: { gte: since } }),
    count("ticket", { createdAt: { gte: since } }),
  ]);
  return { attendance, leave, jobs, payroll, helpdesk };
}

/** GET /platform/admin/tenants/:tenantId */
export async function getTenant(req: Request, res: Response) {
  try {
    const id = String(req.params.tenantId);
    if (!OBJECT_ID.test(id) || id === platformTenantId())
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Organisation not found",
      });
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        ...TENANT_FIELDS,
        dbName: true,
        industry: true,
        companySize: true,
        domain: true,
        website: true,
        helpEmail: true,
        helpPhone: true,
        pendingPlanChangeAt: true,
        paymentMethod: true,
        paymentMethodSummary: true,
        lastBilledQuantity: true,
      },
    });
    if (!tenant)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Organisation not found",
      });

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const withBilling = canSeeBilling(req);
    const [
      statuses,
      owner,
      members,
      lastSignIn,
      signIns30,
      supportOpen,
      usage,
      payments,
      audit,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["employeeStatus"],
        where: { tenantId: id },
        _count: { _all: true },
      }),
      prisma.tenantMembership.findFirst({
        where: { tenantId: id, role: "owner" },
        select: { userId: true },
      }),
      prisma.tenantMembership.count({ where: { tenantId: id } }),
      prisma.loginEvent.findFirst({
        where: { tenantId: id },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
      prisma.loginEvent.count({
        where: { tenantId: id, timestamp: { gte: since30 } },
      }),
      prisma.supportTicket.count({
        where: {
          tenantId: id,
          status: { in: ["open", "in_progress", "waiting_for_tenant"] },
        },
      }),
      tenant.dbName ? moduleUsage(tenant.dbName, since30) : null,
      withBilling
        ? prisma.billingPayment.findMany({
            where: { tenantId: id },
            orderBy: { paidAt: "desc" },
            take: 25,
          })
        : null,
      prismaWithTenant.auditLog.aggregateRaw({
        pipeline: [
          {
            $match: {
              entityType: AUDIT_ENTITY,
              "newValue.targetTenantId": id,
            },
          },
          { $sort: { timestamp: -1 } },
          { $limit: 20 },
        ],
      }),
    ]);

    const ownerUser = owner
      ? await prisma.user.findUnique({
          where: { id: owner.userId },
          select: { first_name: true, last_name: true, email: true },
        })
      : null;
    const byStatus = Object.fromEntries(
      (statuses as any[]).map((s) => [s.employeeStatus, s._count._all]),
    );
    const records = Object.values(byStatus).reduce(
      (a: number, n: any) => a + n,
      0,
    );
    const t = tenant as unknown as TenantRow;

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        organisation: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          createdAt: tenant.createdAt,
          isActive: tenant.isActive,
          industry: tenant.industry,
          companySize: tenant.companySize,
          domain: tenant.domain,
          website: tenant.website,
          helpEmail: tenant.helpEmail,
          helpPhone: tenant.helpPhone,
          // The billing contact (renewal and payment emails go here).
          owner: ownerUser
            ? {
                name:
                  [ownerUser.first_name, ownerUser.last_name]
                    .filter(Boolean)
                    .join(" ") || null,
                email: ownerUser.email,
              }
            : null,
        },
        workforce: {
          records,
          active: byStatus.Active ?? 0,
          inactive: records - (byStatus.Active ?? 0),
          byStatus,
          userAccounts: members,
        },
        subscription: {
          status: tenant.subscriptionStatus,
          hasAccess: hasAccess(t),
          kind: kindOf(t),
          planTier: tierOf(t),
          billing: billingOf(t),
          monthlyValue: isPaying(t) ? Math.round(monthlyValuePaise(t)) : 0,
          trialStartedAt: tenant.trialStartedAt,
          trialEndsAt: tenant.trialEndsAt,
          activatedAt: tenant.planActivatedAt,
          currentPeriodEndsAt: tenant.planExpiresAt,
          pendingPlanTier: tenant.pendingPlanTier,
          pendingBilling: tenant.pendingBilling,
          pendingChangeAt: tenant.pendingPlanChangeAt,
          hasRazorpaySubscription: !!tenant.razorpaySubscriptionId,
          ...(withBilling && {
            razorpaySubscriptionId: tenant.razorpaySubscriptionId,
            paymentMethod: tenant.paymentMethod,
            paymentMethodSummary: tenant.paymentMethodSummary,
            lastBilledQuantity: tenant.lastBilledQuantity,
          }),
        },
        payments: payments?.map((p) => paymentView(p)) ?? null,
        usage: {
          lastSignInAt: lastSignIn?.timestamp ?? null,
          signInsLast30Days: signIns30,
          openSupportTickets: supportOpen,
          last30Days: usage,
        },
        audit: (audit as unknown as any[]).map(auditView),
      },
    });
  } catch (error) {
    return fail(res, "getTenant", error);
  }
}

// ── Subscriptions ───────────────────────────────────────────────────────────

const brief = (t: TenantRow, at: Date | null) => ({
  id: t.id,
  name: t.name,
  planTier: tierOf(t),
  billing: billingOf(t),
  status: t.subscriptionStatus,
  at,
});

/** GET /platform/admin/subscriptions?range= */
export async function getSubscriptions(req: Request, res: Response) {
  try {
    const now = new Date();
    const tenants = await loadCustomers();
    const range = resolveRange(req.query as any, now, earliest(tenants));
    const in30 = new Date(now.getTime() + 30 * DAY_MS);
    const soon = (d: Date | null) => !!d && d >= now && d < in30;
    const byDate = (a: { at: Date | null }, b: { at: Date | null }) =>
      +(a.at ?? 0) - +(b.at ?? 0);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        range: rangeOut(range),
        counts: subscriptionCounts(tenants, now),
        mrr: mrrSummary(tenants, now),
        trials: trialConversion(tenants, range.from, range.to, now),
        lists: {
          pastDue: tenants
            .filter((t) => t.subscriptionStatus === "grace_period")
            .map((t) => brief(t, t.planExpiresAt))
            .sort(byDate),
          renewingSoon: tenants
            .filter((t) => isPaying(t) && soon(t.planExpiresAt))
            .map((t) => brief(t, t.planExpiresAt))
            .sort(byDate),
          endingSoon: tenants
            .filter(
              (t) =>
                t.subscriptionStatus === "cancelled" && soon(t.planExpiresAt),
            )
            .map((t) => brief(t, t.planExpiresAt))
            .sort(byDate),
          trialsEndingSoon: tenants
            .filter(
              (t) =>
                t.subscriptionStatus === "trialing" &&
                !!t.trialEndsAt &&
                t.trialEndsAt >= now &&
                t.trialEndsAt < new Date(now.getTime() + 7 * DAY_MS),
            )
            .map((t) => brief(t, t.trialEndsAt))
            .sort(byDate),
          // Scheduled for the end of the current cycle (changePlan).
          pendingChanges: tenants
            .filter((t) => t.pendingPlanTier || t.pendingBilling)
            .map((t) => ({
              ...brief(t, t.planExpiresAt),
              toPlanTier: t.pendingPlanTier ?? tierOf(t),
              toBilling: t.pendingBilling ?? billingOf(t),
            })),
        },
      },
    });
  } catch (error) {
    return fail(res, "getSubscriptions", error);
  }
}

// ── Payments and revenue ────────────────────────────────────────────────────

function paymentView(p: any, tenantName?: string) {
  return {
    id: p.id,
    razorpayPaymentId: p.razorpayPaymentId,
    tenantId: p.tenantId,
    tenantName: tenantName ?? undefined,
    subscriptionId: p.subscriptionId,
    invoiceId: p.invoiceId,
    amount: p.amount,
    currency: p.currency,
    status: paymentState(p.status, p.amountRefunded ?? 0),
    providerStatus: p.status,
    method: p.method,
    amountRefunded: p.amountRefunded,
    refundStatus: p.refundStatus,
    errorCode: p.errorCode,
    errorDescription: p.errorDescription,
    planTier: p.planTier,
    billing: p.billing,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    paidAt: p.paidAt,
    syncedAt: p.syncedAt,
  };
}

/** GET /platform/admin/payments — the ledger, newest first. */
export async function listPayments(req: Request, res: Response) {
  try {
    const q = req.query as any;
    const platform = platformTenantId();
    const where: Record<string, any> = {};
    if (q.status === "pending")
      where.status = { in: ["created", "authorized"] };
    else if (q.status === "refunded") where.amountRefunded = { gt: 0 };
    else if (q.status === "captured")
      Object.assign(where, { status: "captured", amountRefunded: 0 });
    else if (q.status) where.status = q.status;
    if (q.from)
      where.paidAt = {
        gte: istDate(q.from),
        lt: new Date(istDate(q.to).getTime() + DAY_MS),
      };

    const term = String(q.search ?? "").trim();
    let tenantFilter: string[] | null = q.tenantId ? [q.tenantId] : null;
    if (term) {
      if (/^(pay|inv|sub)_/i.test(term)) {
        where.OR = [
          { razorpayPaymentId: term },
          { invoiceId: term },
          { subscriptionId: term },
        ];
      } else {
        const matches = await prisma.tenant.findMany({
          where: { name: { contains: term, mode: "insensitive" } },
          select: { id: true },
          take: 200,
        });
        const ids = matches.map((m) => m.id);
        tenantFilter = tenantFilter
          ? tenantFilter.filter((id) => ids.includes(id))
          : ids;
      }
    }
    if (tenantFilter) where.tenantId = { in: tenantFilter };
    if (platform) where.AND = [{ tenantId: { not: platform } }];

    const [rows, total] = await Promise.all([
      prisma.billingPayment.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.billingPayment.count({ where }),
    ]);
    const names = new Map(
      (
        await prisma.tenant.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } },
          select: { id: true, name: true },
        })
      ).map((t) => [t.id, t.name]),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        payments: rows.map((r) => paymentView(r, names.get(r.tenantId))),
        totalCount: total,
        page: q.page,
        ledger: await ledgerCoverage(),
      },
    });
  } catch (error) {
    return fail(res, "listPayments", error);
  }
}

/** Month-end instants (IST) inside the range, for the billed-MRR series. */
function monthEnds(range: DateRange, now: Date): Date[] {
  const out: Date[] = [];
  const keys = new Set<string>();
  for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS)
    keys.add(bucketKey(new Date(t), "month"));
  for (const k of keys) {
    const [y, m] = k.split("-").map(Number);
    const next = istDate(
      `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`,
    );
    const at = new Date(Math.min(next.getTime() - 1, now.getTime()));
    out.push(at);
  }
  return out;
}

/** GET /platform/admin/revenue?range= */
export async function getRevenue(req: Request, res: Response) {
  try {
    const now = new Date();
    const tenants = await loadCustomers();
    const range = resolveRange(req.query as any, now, earliest(tenants));
    const [payments, prevPayments, periodPayments, coverage] =
      await Promise.all([
        customerPayments(range.from, range.to),
        customerPayments(range.prevFrom, range.prevTo),
        customerPayments(
          new Date(range.from.getTime() - 400 * DAY_MS),
          range.to,
        ),
        ledgerCoverage(),
      ]);
    const monthly = {
      ...range,
      bucket: "month" as const,
    };
    const billedMrr = monthEnds(range, now).map((at) => ({
      key: bucketKey(at, "month"),
      value: billedMrrAt(periodPayments, at),
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        range: rangeOut(range),
        collections: collections(payments),
        previousCollections: collections(prevPayments),
        byMonth: series(
          payments.filter((p) => p.currency === "INR"),
          monthly,
          (p) => p.paidAt,
          (p) =>
            p.status === "captured" || p.status === "refunded"
              ? p.amount - Math.min(p.amountRefunded, p.amount)
              : 0,
        ),
        byPlan: netBy(payments, (p) => p.planTier ?? "unmatched"),
        byBilling: netBy(payments, (p) => p.billing ?? "unknown"),
        arpa: arpa(payments),
        mrr: mrrSummary(tenants, now),
        billedMrr,
        ledger: coverage,
      },
    });
  } catch (error) {
    return fail(res, "getRevenue", error);
  }
}

// ── Audit log ───────────────────────────────────────────────────────────────

function auditView(a: any) {
  const v = a.newValue ?? {};
  return {
    id: ejsonId(a._id ?? a.id),
    at: ejsonDate(a.timestamp),
    actorId: a.userId ? ejsonId(a.userId) : null,
    actor: a.username ?? null,
    action: v.action ?? a.action,
    description: a.description,
    targetTenantId: v.targetTenantId ?? null,
    targetTenantName: v.targetTenantName ?? null,
    reason: v.reason ?? null,
    result: v.result ?? null,
    details: v.details ?? null,
    requestId: v.requestId ?? null,
  };
}

/**
 * Record a sensitive platform action in Praesto's own organisation's audit
 * log (the request runs in that tenant's context), entityType
 * "PlatformAdmin". No endpoint edits or deletes audit rows. Never stores
 * tokens, credentials or payment instrument details.
 */
export async function writePlatformAudit(
  req: Request,
  entry: {
    action: string;
    description: string;
    targetTenantId?: string | null;
    targetTenantName?: string | null;
    reason?: string | null;
    result: "success" | "failure";
    details?: Record<string, unknown>;
  },
) {
  const user = (req as AuthRequest).user;
  try {
    const actor = user?.userId
      ? await prisma.user.findUnique({
          where: { id: user.userId },
          select: { username: true },
        })
      : null;
    await prismaWithTenant.auditLog.create({
      data: {
        tenantId: user?.tenantId ?? null,
        userId: user?.userId ?? null,
        username: actor?.username ?? null,
        action: "PLATFORM_ADMIN",
        entityType: AUDIT_ENTITY,
        description: entry.description,
        // JSON round-trip: details may carry Dates (state diffs).
        newValue: JSON.parse(
          JSON.stringify({
            action: entry.action,
            targetTenantId: entry.targetTenantId ?? null,
            targetTenantName: entry.targetTenantName ?? null,
            reason: entry.reason ?? null,
            result: entry.result,
            details: entry.details ?? null,
            requestId: (req.headers["x-request-id"] as string) ?? null,
          }),
        ),
        ipAddress: req.ip || req.socket?.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
      },
    });
  } catch (error) {
    logger.error("platform audit write failed", {
      error,
      action: entry.action,
    });
  }
}

/** GET /platform/admin/audit-logs */
export async function listAuditLogs(req: Request, res: Response) {
  try {
    const q = req.query as any;
    const where = { entityType: AUDIT_ENTITY };
    const [rows, total] = await Promise.all([
      prismaWithTenant.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prismaWithTenant.auditLog.count({ where }),
    ]);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { entries: rows.map(auditView), totalCount: total, page: q.page },
    });
  } catch (error) {
    return fail(res, "listAuditLogs", error);
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

/** Statuses the scheduled reconciler heals; the same set applies here. */
const RECONCILABLE = ["trialing", "active", "grace_period", "cancelling"];

const STATE_FIELDS = [
  "subscriptionStatus",
  "planTier",
  "billing",
  "planActivatedAt",
  "planExpiresAt",
  "pendingPlanTier",
  "pendingBilling",
] as const;

/**
 * POST /platform/admin/tenants/:tenantId/sync {reason}
 * Re-read one organisation's subscription from Razorpay: the scheduled
 * reconciler's own per-tenant step (reconcileTenant) when its status is one
 * the reconciler heals, then a full ledger sync of its payments. Converges
 * to Razorpay's state, so repeating it is harmless. Audited either way.
 */
export async function syncTenant(req: Request, res: Response) {
  const id = String(req.params.tenantId);
  const reason = String(req.body.reason);
  if (!OBJECT_ID.test(id) || id === platformTenantId())
    return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
      message: "Organisation not found",
    });
  const tenant = await prisma.tenant
    .findUnique({ where: { id }, select: { ...RECONCILE_SELECT, name: true } })
    .catch(() => null);
  if (!tenant)
    return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
      message: "Organisation not found",
    });
  if (!tenant.razorpaySubscriptionId)
    return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
      message: "This organisation has no Razorpay subscription to sync.",
    });

  const before = Object.fromEntries(
    STATE_FIELDS.map((f) => [f, (tenant as any)[f] ?? null]),
  );
  try {
    const reconciled = RECONCILABLE.includes(tenant.subscriptionStatus);
    if (reconciled)
      await reconcileTenant(getRazorpay(), tenant as any, new Date());
    const payments = await syncTenantLedger(tenant);
    const after = await prisma.tenant.findUnique({
      where: { id },
      select: Object.fromEntries(STATE_FIELDS.map((f) => [f, true])) as any,
    });
    const changed = Object.fromEntries(
      STATE_FIELDS.filter(
        (f) => String(before[f]) !== String((after as any)?.[f] ?? null),
      ).map((f) => [f, { from: before[f], to: (after as any)?.[f] ?? null }]),
    );
    await writePlatformAudit(req, {
      action: "subscription.sync",
      description: `Synced ${tenant.name}'s subscription from Razorpay`,
      targetTenantId: id,
      targetTenantName: tenant.name,
      reason,
      result: "success",
      details: { reconciled, paymentsRecorded: payments, changed },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: Object.keys(changed).length
        ? "Synced — subscription state was corrected from Razorpay."
        : "Synced — subscription state already matched Razorpay.",
      data: { reconciled, paymentsRecorded: payments, changed },
    });
  } catch (error) {
    await writePlatformAudit(req, {
      action: "subscription.sync",
      description: `Sync of ${tenant.name}'s subscription from Razorpay failed`,
      targetTenantId: id,
      targetTenantName: tenant.name,
      reason,
      result: "failure",
    });
    logger.error("platformAdmin.syncTenant error:", { error, tenantId: id });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message:
        "Razorpay couldn't be reached or refused the request. Try again later.",
    });
  }
}

const SYNC_ALL_LOCK = "lock:platform-billing-sync";

/**
 * POST /platform/admin/billing/sync {reason}
 * Backfill/refresh the payment ledger for every organisation that has a
 * Razorpay subscription. Ledger only — subscription state is left to the
 * scheduled reconciler. One run at a time (Redis lease).
 */
export async function syncAllPayments(req: Request, res: Response) {
  const reason = String(req.body.reason);
  let locked = false;
  try {
    locked =
      (await getRedisClient().set(SYNC_ALL_LOCK, "1", "EX", 15 * 60, "NX")) ===
      "OK";
  } catch {
    locked = false;
  }
  if (!locked)
    return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
      message: "A payment sync is already running. Try again in a few minutes.",
    });
  try {
    const platform = platformTenantId();
    const tenants = await prisma.tenant.findMany({
      where: {
        razorpaySubscriptionId: { not: null },
        ...(platform && { id: { not: platform } }),
      },
      select: {
        id: true,
        razorpaySubscriptionId: true,
        previousRazorpaySubscriptionId: true,
      },
    });
    let recorded = 0;
    const failed: string[] = [];
    for (const t of tenants) {
      try {
        recorded += await syncTenantLedger(t);
      } catch (err) {
        failed.push(t.id);
        logger.warn(`Platform ledger sync failed for tenant ${t.id}`, { err });
      }
    }
    await writePlatformAudit(req, {
      action: "billing.sync_all",
      description: `Synced payments from Razorpay for ${tenants.length} organisations`,
      reason,
      result: failed.length ? "failure" : "success",
      details: { tenants: tenants.length, paymentsRecorded: recorded, failed },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: failed.length
        ? `Synced with ${failed.length} organisation(s) failing — see the audit log.`
        : `Synced ${recorded} payment(s) across ${tenants.length} organisation(s).`,
      data: { tenants: tenants.length, paymentsRecorded: recorded, failed },
    });
  } finally {
    await getRedisClient()
      .del(SYNC_ALL_LOCK)
      .catch(() => {});
  }
}
