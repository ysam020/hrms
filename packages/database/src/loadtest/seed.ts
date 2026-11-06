/**
 * Seeds the synthetic organisations used by the load-testing framework
 * (load-testing/README.md). Writes ONLY new records, all of them marked:
 *   - master `tenants`: name "LOADTEST_ …", slug "loadtest-…"
 *   - master `users`: username "loadtest_…", email "…@loadtest.invalid"
 *   - master `tenant_memberships` for those users
 *   - one new tenant database per org, "hrms-loadtest-…", whose `_init`
 *     document carries marker "LOADTEST" and this run's id
 * Every created id is written to load-testing/.state/manifest.json before
 * moving on, so cleanup.ts can remove exactly what was created even if this
 * script dies halfway. Nothing existing is read for modification, updated or
 * deleted.
 *
 * Usage (repo root):
 *   CONFIRM_DB_WRITE_HOST=<atlas host> \
 *   pnpm --filter=@hrms/db exec tsx src/loadtest/seed.ts
 *
 * The data is deterministic (fixed PRNG seed) so repeated runs produce the
 * same dataset shape, which keeps benchmarks comparable.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertConfirmedWriteTarget, databaseHost } from "../scriptGuard";
import {
  MANIFEST_PATH,
  ORGS,
  type Manifest,
  type OrgSpec,
  type SeededOrg,
  buildUrl,
  readManifest,
  writeManifest,
} from "./common";

// Shared and Flex Atlas tiers cap a cluster at 500 collections.
const COLLECTION_CAP = 500;

const master = new PrismaClient({ datasourceUrl: process.env.DEV_MONGODB_URI });

// ── deterministic helpers ────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(20261105);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const dayStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const FIRST = [
  "Aarav",
  "Diya",
  "Kabir",
  "Meera",
  "Rohan",
  "Anaya",
  "Vihaan",
  "Isha",
  "Arjun",
  "Saanvi",
  "Reyansh",
  "Kiara",
  "Advait",
  "Myra",
  "Dhruv",
  "Tara",
];
const LAST = [
  "Sharma",
  "Iyer",
  "Khan",
  "Reddy",
  "Patel",
  "Das",
  "Nair",
  "Gupta",
  "Singh",
  "Mehta",
  "Bose",
  "Joshi",
];
const DEPARTMENTS: Record<string, string[]> = {
  ENGINEERING: [
    "Software Engineer",
    "Senior Software Engineer",
    "Engineering Manager",
    "QA Engineer",
  ],
  "HUMAN RESOURCES": ["HR Executive", "HR Manager"],
  SALES: ["Sales Executive", "Account Manager"],
  MARKETING: ["Marketing Executive", "Content Strategist"],
  FINANCE: ["Accountant", "Finance Manager"],
  OPERATIONS: ["Operations Executive", "Operations Manager"],
  SUPPORT: ["Support Engineer", "Support Lead"],
  DESIGN: ["Product Designer", "Design Lead"],
};

// Permission sets per role, drawn from permissionCatalog.ts. Sizes (owner
// none: implicit via isSuperUser; HR ~30; manager ~16; employee ~12) bracket
// the live average of 15 and maximum of 57 strings per user.
const EMPLOYEE_PERMS = [
  "Attendance:view:self",
  "Attendance:mark_attendance:self",
  "Leave:view:self",
  "Leave:apply:self",
  "BasicKYCDetails:fill_kyc_form:self",
  "BasicKYCDetails:view_kyc:self",
  "TaxDeclaration:fill_declaration:self",
  "TaxDeclaration:view_declaration:self",
  "ResignationProcess:resign:self",
  "ResignationProcess:withdraw_resignation:self",
  "ResignationProcess:add_exit_feedback:self",
  "ResignationProcess:view_resignation:self",
];
const MANAGER_PERMS = [
  ...EMPLOYEE_PERMS,
  "Attendance:view:team",
  "Leave:view:team",
  "Leave:approve:team",
  "Leave:reject:team",
  "ResignationProcess:view_resignation:team",
  "ResignationProcess:approve_resignation:team",
  "WFH:approve",
  "JobOpenings:take_interview",
  "JobOpenings:provide_feedback",
];
const HR_PERMS = [
  ...EMPLOYEE_PERMS,
  "Attendance:view:all",
  "Attendance:attendance_correction:all",
  "Leave:view:all",
  "Leave:approve:all",
  "Leave:reject:all",
  "EmployeeManagement:view",
  "EmployeeManagement:edit",
  "BasicKYCDetails:view_kyc:all",
  "BasicKYCDetails:approve_kyc:all",
  "BasicKYCDetails:request_kyc_revision:all",
  "TaxDeclaration:view_declaration:all",
  "TaxDeclaration:review_declaration:all",
  "ResignationProcess:view_resignation:all",
  "ResignationProcess:approve_resignation:all",
  "Holidays:add",
  "Holidays:delete",
  "Policy:create",
  "Policy:update",
  "HRActivities:view:all",
  "HRActivities:create",
  "HRActivities:edit",
  "JobOpenings:view_job_openings",
  "JobOpenings:view_applications",
  "SalaryManagement:view_salaries",
  "Presence:view:all",
  "WFH:approve",
  "Helpdesk:manage",
];

type Role = "owner" | "admin" | "hr" | "manager" | "employee";
function roleFor(index: number, size: number): Role {
  if (index === 0) return "owner";
  if (index === 1) return "admin";
  if (index < 2 + Math.max(2, Math.round(size * 0.02))) return "hr";
  if (index % 10 === 0) return "manager";
  return "employee";
}

async function totalCollections(): Promise<number> {
  const admin = new PrismaClient({ datasourceUrl: buildUrl("admin") });
  let res: any;
  try {
    res = await (admin.$runCommandRaw as any)({
      listDatabases: 1,
      nameOnly: true,
    });
  } finally {
    await admin.$disconnect();
  }
  let total = 0;
  for (const { name } of res.databases as { name: string }[]) {
    if (name === "admin" || name === "local") continue;
    const client = new PrismaClient({ datasourceUrl: buildUrl(name) });
    try {
      const r: any = await (client.$runCommandRaw as any)({
        listCollections: 1,
        nameOnly: true,
      });
      total += r.cursor.firstBatch.length;
    } finally {
      await client.$disconnect();
    }
  }
  return total;
}

async function seedOrg(
  spec: OrgSpec,
  manifest: Manifest,
  budget: { perTenant: number | null },
): Promise<void> {
  const existing = await master.tenant.findUnique({
    where: { slug: spec.slug },
    select: { id: true },
  });
  if (existing) {
    throw new Error(
      `Tenant slug ${spec.slug} already exists. Run cleanup.ts first.`,
    );
  }

  const before = await totalCollections();
  if (
    budget.perTenant !== null &&
    before + budget.perTenant >= COLLECTION_CAP
  ) {
    throw new Error(
      `Refusing to create ${spec.dbName}: ${before} collections now + ~${budget.perTenant} would reach the ${COLLECTION_CAP} cap.`,
    );
  }

  const now = new Date();
  const tenant = await master.tenant.create({
    data: {
      name: spec.name,
      slug: spec.slug,
      dbName: spec.dbName,
      plan: "pro",
      planTier: "starter",
      subscriptionStatus: "active",
      planActivatedAt: now,
      planExpiresAt: addDays(now, 30),
      isActive: true,
    },
  });
  const org: SeededOrg = {
    key: spec.key,
    tenantId: tenant.id,
    slug: spec.slug,
    dbName: spec.dbName,
    userIds: [],
    membershipIds: [],
    users: [],
    collectionsAdded: null,
  };
  manifest.orgs.push(org);
  writeManifest(manifest);

  // Same physical layout real tenants get: `prisma db push` against the new
  // (empty) database, exactly like push-to-all-tenants.ts does per tenant.
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    stdio: "inherit",
    env: { ...process.env, DEV_MONGODB_URI: buildUrl(spec.dbName) },
  });

  const tdb = new PrismaClient({ datasourceUrl: buildUrl(spec.dbName) });
  try {
    // The marker lives in `_init` (which every real tenant has) rather than
    // its own collection: the cluster is close to its collection cap.
    await (tdb.$runCommandRaw as any)({
      insert: "_init",
      documents: [
        {
          _id: { $oid: tenant.id },
          tenantId: tenant.id,
          initializedAt: { $date: now.toISOString() },
          marker: "LOADTEST",
          runId: manifest.runId,
        },
      ],
    });
    // Departments and designations.
    const deptIds: Record<string, string> = {};
    const desigIds: Record<string, string> = {};
    for (const [dept, titles] of Object.entries(DEPARTMENTS)) {
      const d = await tdb.department.create({
        data: { tenantId: tenant.id, name: dept },
      });
      deptIds[dept] = d.id;
      for (const t of titles) {
        if (desigIds[t]) continue;
        const g = await tdb.designation.create({
          data: { tenantId: tenant.id, name: t, departmentId: d.id },
        });
        desigIds[t] = g.id;
      }
    }

    // Users (master) and memberships.
    const deptNames = Object.keys(DEPARTMENTS);
    const users = Array.from({ length: spec.size }, (_, i) => {
      const role = roleFor(i, spec.size);
      const dept =
        role === "hr" ? "HUMAN RESOURCES" : deptNames[i % deptNames.length];
      const username = `loadtest_${spec.key}_${String(i + 1).padStart(4, "0")}`;
      const joined = addDays(now, -int(30, 2200));
      const dob = new Date(Date.UTC(int(1975, 2002), int(0, 11), int(1, 28)));
      return {
        tenantId: tenant.id,
        username,
        email: `${username}@loadtest.invalid`,
        first_name: `LOADTEST_${pick(FIRST)}`,
        last_name: pick(LAST),
        dob,
        joining_date: joined,
        department: dept,
        departmentId: deptIds[dept],
        designation: pick(DEPARTMENTS[dept]),
        employeeStatus: "Active",
        kyc_approval: "Approved",
        kyc_date: addDays(joined, 3),
        role: [],
        permissions:
          role === "owner"
            ? []
            : role === "hr" || role === "admin"
              ? HR_PERMS
              : role === "manager"
                ? MANAGER_PERMS
                : EMPLOYEE_PERMS,
        isSuperUser: role === "owner",
        _role: role,
      };
    });
    for (const u of users) {
      const { _role, ...data } = u;
      const created = await master.user.create({ data, select: { id: true } });
      org.userIds.push(created.id);
      org.users.push({ id: created.id, username: u.username, role: _role });
    }
    writeManifest(manifest);
    for (const u of org.users) {
      const m = await master.tenantMembership.create({
        data: { tenantId: tenant.id, userId: u.id, role: u.role },
        select: { id: true },
      });
      org.membershipIds.push(m.id);
    }
    writeManifest(manifest);

    // Same initial settings document signup creates, attributed to the owner.
    const owner = org.users.find((u) => u.role === "owner")!;
    await tdb.tenantSettings.create({
      data: {
        tenantId: tenant.id,
        effectiveFrom: addDays(now, -365),
        createdBy: owner.id,
        note: "LOADTEST_ initial defaults",
        workWeekPattern: { type: "mon_fri", workingDays: [1, 2, 3, 4, 5] },
        leavePolicies: [
          {
            key: "MATERNITY",
            name: "Maternity Leave",
            daysPerYear: 182,
            isStatutory: true,
            requiresProof: true,
            onExhaustion: "manager_override",
          },
          {
            key: "PATERNITY",
            name: "Paternity Leave",
            daysPerYear: 15,
            isStatutory: false,
            requiresProof: false,
            onExhaustion: "manager_override",
          },
        ],
      },
    });

    // Teams: one per manager, ~8 reports each.
    const managers = org.users.filter((u) => u.role === "manager");
    const reports = org.users.filter((u) => u.role === "employee");
    for (const [mi, m] of managers.entries()) {
      const members = reports
        .filter((_, ri) => ri % managers.length === mi)
        .map((r) => r.id);
      await tdb.team.create({
        data: {
          tenantId: tenant.id,
          teamName: `LOADTEST_ Team ${mi + 1}`,
          teamLeaderId: m.id,
          members: [m.id, ...members],
        },
      });
    }

    // Holidays: the current and previous year, month documents.
    for (const year of [now.getUTCFullYear() - 1, now.getUTCFullYear()]) {
      for (let month = 1; month <= 12; month++) {
        const n = month % 3 === 0 ? 2 : 1;
        await tdb.holiday.create({
          data: {
            tenantId: tenant.id,
            year,
            month,
            holidays: Array.from({ length: n }, (_, k) => ({
              name: `LOADTEST_ Holiday ${month}.${k + 1}`,
              date: `${year}-${String(month).padStart(2, "0")}-${String(5 + k * 10).padStart(2, "0")}`,
              createdBy: "admin",
              createdOn: new Date(Date.UTC(year, 0, 1)),
            })),
          },
        });
      }
    }

    // Attendance: the last 75 days for everyone, weekends as Week Off.
    const today = dayStart(now);
    const attendance: any[] = [];
    for (const u of org.users) {
      for (let back = 75; back >= 1; back--) {
        const date = addDays(today, -back);
        const dow = date.getUTCDay();
        if (dow === 0 || dow === 6) {
          attendance.push({
            tenantId: tenant.id,
            userId: u.id,
            date,
            status: "Week Off",
          });
          continue;
        }
        const r = rand();
        const status =
          r < 0.72
            ? "Present"
            : r < 0.82
              ? "Late"
              : r < 0.88
                ? "WFH"
                : r < 0.94
                  ? "Half Day"
                  : "Leave";
        if (status === "Leave") {
          attendance.push({ tenantId: tenant.id, userId: u.id, date, status });
          continue;
        }
        const inMin = 9 * 60 + (status === "Late" ? int(31, 90) : int(-20, 25));
        const hours = status === "Half Day" ? 4 + rand() : 8 + rand() * 1.5;
        const timeIn = new Date(date.getTime() + (inMin - 330) * 60_000); // IST → UTC
        const timeOut = new Date(timeIn.getTime() + hours * 3_600_000);
        attendance.push({
          tenantId: tenant.id,
          userId: u.id,
          date,
          timeIn,
          timeOut,
          workingHours: Math.round(hours * 100) / 100,
          overtimeHours: hours > 9 ? Math.round((hours - 9) * 100) / 100 : 0,
          status,
        });
      }
    }
    for (let i = 0; i < attendance.length; i += 5000) {
      await tdb.attendanceRecord.createMany({
        data: attendance.slice(i, i + 5000),
      });
    }

    // Leave applications: ~6 per person across the year, some still pending.
    const leaves: any[] = [];
    for (const u of org.users) {
      for (let k = 0; k < 6; k++) {
        const from = addDays(today, int(-300, 45));
        const days = pick([0.5, 1, 1, 1, 2, 3]);
        const future = from > today;
        const status = future
          ? pick(["Pending", "Pending", "Approved"])
          : pick(["Approved", "Approved", "Approved", "Rejected", "Cancelled"]);
        leaves.push({
          tenantId: tenant.id,
          userId: u.id,
          from,
          to: addDays(from, Math.max(0, Math.ceil(days) - 1)),
          leaveType: pick(["PL", "PL", "SL", "CL", "LWP"]),
          days,
          status,
          reason: "LOADTEST_ synthetic leave",
          appliedOn: addDays(from, -int(1, 14)),
          unit: days === 0.5 ? "half_day" : "full_day",
          session: days === 0.5 ? pick(["first_half", "second_half"]) : null,
        });
      }
    }
    await tdb.leaveApplication.createMany({ data: leaves });
    await tdb.leaveBalance.createMany({
      data: org.users.map((u) => ({
        tenantId: tenant.id,
        userId: u.id,
        accumulatedPLBeforeCurrentMonth: int(0, 12),
        balances: Array.from({ length: now.getUTCMonth() + 1 }, (_, m) => ({
          month: m + 1,
          year: now.getUTCFullYear(),
          earnedPL: 1.5,
          usedPL: pick([0, 0, 1, 1.5]),
          usedLWP: pick([0, 0, 0, 1]),
          remainingPL: int(0, 12),
        })),
      })),
    });

    // HR activities, notifications (+ recipients) and audit history.
    const hr = org.users.find((u) => u.role === "hr")!;
    await tdb.hrActivity.createMany({
      data: Array.from({ length: 16 }, (_, k) => ({
        tenantId: tenant.id,
        title: `LOADTEST_ Activity ${k + 1}`,
        description: "Synthetic HR activity for load testing.",
        scheduledAt: addDays(now, int(-40, 40)),
        status: k % 4 === 0 ? "completed" : "scheduled",
        createdBy: hr.username,
      })),
    });
    for (let k = 0; k < 30; k++) {
      const n = await tdb.notification.create({
        data: {
          tenantId: tenant.id,
          title: `LOADTEST_ Notification ${k + 1}`,
          message: "Synthetic notification for load testing.",
          timeStamp: addDays(now, -int(0, 60)),
          eventType: pick(["general", "leave", "attendance", "announcement"]),
        },
        select: { id: true },
      });
      const audience =
        k % 3 === 0 ? org.users : org.users.filter(() => rand() < 0.25);
      await tdb.notificationRecipient.createMany({
        data: audience.map((u) => ({
          tenantId: tenant.id,
          notificationId: n.id,
          userId: u.id,
          isCleared: rand() < 0.6,
        })),
      });
    }
    const auditRows: any[] = Array.from({ length: spec.size * 12 }, () => {
      const u = pick(org.users);
      const entityType = pick([
        "LeaveApplication",
        "AttendanceRecord",
        "User",
        "TenantSettings",
        "Team",
      ]);
      return {
        tenantId: tenant.id,
        userId: u.id,
        username: u.username,
        action: pick(["create", "update", "update", "delete"]),
        entityType,
        description: `LOADTEST_ ${entityType} change`,
        oldValue: { status: "Pending" },
        newValue: { status: "Approved" },
        ipAddress: "203.0.113.10",
        userAgent: "LOADTEST_seed",
        timestamp: addDays(now, -rand() * 90),
      };
    });
    for (let i = 0; i < auditRows.length; i += 5000) {
      await tdb.auditLog.createMany({ data: auditRows.slice(i, i + 5000) });
    }
  } finally {
    await tdb.$disconnect();
  }

  const after = await totalCollections();
  org.collectionsAdded = after - before;
  budget.perTenant = org.collectionsAdded;
  writeManifest(manifest);
  console.log(
    `✓ ${spec.name}: ${org.users.length} users, ${org.collectionsAdded} collections added (cluster total ${after}/${COLLECTION_CAP})`,
  );
}

async function main() {
  assertConfirmedWriteTarget("loadtest-seed");
  const prior = readManifest();
  if (prior && prior.orgs.length > 0) {
    throw new Error(
      `${MANIFEST_PATH} already lists seeded orgs (run ${prior.runId}). Run cleanup.ts first.`,
    );
  }
  const manifest: Manifest = {
    runId: `LOADTEST_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    host: databaseHost(process.env.DEV_MONGODB_URI)!,
    orgs: [],
  };
  writeManifest(manifest);
  const budget = { perTenant: null as number | null };
  for (const spec of ORGS) {
    rand = mulberry32(20261105 + spec.size);
    await seedOrg(spec, manifest, budget);
  }
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => master.$disconnect());
