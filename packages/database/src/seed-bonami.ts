/**
 * Seed script for Bonami Software tenant.
 *
 * 1. Inserts 5 dummy users into master DB (hrms-dev) for the Bonami tenant
 * 2. Creates tenant_memberships for those users
 * 3. Seeds all business collections in hrms-bonami-software
 *
 * Usage:
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm --filter=@hrms/db exec tsx src/seed-bonami.ts
 *
 * Idempotent: safe to re-run.
 */

import { PrismaClient } from "@prisma/client";

const BONAMI_TENANT_ID = "6a0bd765f9ff1bdc7c809931";
const BONAMI_DB = "hrms-bonami-software";
const OWNER_USER_ID = "6a0bd761fb9690a2894c1cb6"; // sameer_yadav1

const masterPrisma = new PrismaClient({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

const bonamiPrisma = new PrismaClient({ datasourceUrl: buildUrl(BONAMI_DB) });

const rm = (cmd: Record<string, unknown>): Promise<any> =>
  (masterPrisma.$runCommandRaw as any)(cmd);
const rb = (cmd: Record<string, unknown>): Promise<any> =>
  (bonamiPrisma.$runCommandRaw as any)(cmd);

function oid(id: string) {
  return { $oid: id };
}
function extractId(doc: any): string {
  return doc._id?.$oid ?? doc._id?.toString?.() ?? String(doc._id);
}
async function findOne(
  prisma: PrismaClient,
  col: string,
  filter: object,
): Promise<any | null> {
  const run = (cmd: Record<string, unknown>) =>
    (prisma.$runCommandRaw as any)(cmd);
  const res = await run({ find: col, filter, limit: 1 });
  return res?.cursor?.firstBatch?.[0] ?? null;
}
async function countDocs(col: string): Promise<number> {
  const r = await rb({ count: col, query: {} });
  return r?.n ?? 0;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function workdays(startDaysAgo: number, endDaysAgo: number): Date[] {
  const days: Date[] = [];
  for (let i = startDaysAgo; i >= endDaysAgo; i--) {
    const d = daysAgo(i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

// ─── Dummy users ───────────────────────────────────────────────────────────────
const DUMMY_USERS = [
  {
    username: "priya_sharma_bonami",
    email: "priya.sharma@bonami-software.com",
    official_email: "priya.sharma@bonami-software.com",
    first_name: "Priya",
    last_name: "Sharma",
    designation: "HR Manager",
    department: "Human Resources",
    role: ["hr", "manager"],
    joining_date: new Date("2024-01-15"),
    salary: 75000,
    salaryBasicPay: 37500,
    salaryHra: 15000,
    salaryConveyance: 3000,
    salaryPf: 4500,
    salaryEsi: 1312,
    salaryPt: 200,
    kyc_approval: "Approved",
    blood_group: "B+",
    mobile: "9876543211",
  },
  {
    username: "arjun_mehta_bonami",
    email: "arjun.mehta@bonami-software.com",
    official_email: "arjun.mehta@bonami-software.com",
    first_name: "Arjun",
    last_name: "Mehta",
    designation: "Senior Software Engineer",
    department: "Engineering",
    role: ["employee"],
    joining_date: new Date("2024-02-01"),
    salary: 90000,
    salaryBasicPay: 45000,
    salaryHra: 18000,
    salaryConveyance: 3000,
    salaryPf: 5400,
    salaryEsi: 0,
    salaryPt: 200,
    kyc_approval: "Approved",
    blood_group: "O+",
    mobile: "9876543212",
  },
  {
    username: "neha_gupta_bonami",
    email: "neha.gupta@bonami-software.com",
    official_email: "neha.gupta@bonami-software.com",
    first_name: "Neha",
    last_name: "Gupta",
    designation: "Product Designer",
    department: "Design",
    role: ["employee"],
    joining_date: new Date("2024-03-10"),
    salary: 60000,
    salaryBasicPay: 30000,
    salaryHra: 12000,
    salaryConveyance: 2000,
    salaryPf: 3600,
    salaryEsi: 1050,
    salaryPt: 200,
    kyc_approval: "Pending",
    blood_group: "A+",
    mobile: "9876543213",
  },
  {
    username: "rahul_verma_bonami",
    email: "rahul.verma@bonami-software.com",
    official_email: "rahul.verma@bonami-software.com",
    first_name: "Rahul",
    last_name: "Verma",
    designation: "Sales Executive",
    department: "Sales",
    role: ["employee"],
    joining_date: new Date("2024-04-05"),
    salary: 50000,
    salaryBasicPay: 25000,
    salaryHra: 10000,
    salaryConveyance: 2000,
    salaryPf: 3000,
    salaryEsi: 875,
    salaryPt: 200,
    kyc_approval: "Approved",
    blood_group: "AB+",
    mobile: "9876543214",
  },
  {
    username: "kavya_nair_bonami",
    email: "kavya.nair@bonami-software.com",
    official_email: "kavya.nair@bonami-software.com",
    first_name: "Kavya",
    last_name: "Nair",
    designation: "DevOps Engineer",
    department: "Engineering",
    role: ["employee"],
    joining_date: new Date("2024-05-20"),
    salary: 80000,
    salaryBasicPay: 40000,
    salaryHra: 16000,
    salaryConveyance: 3000,
    salaryPf: 4800,
    salaryEsi: 0,
    salaryPt: 200,
    kyc_approval: "Approved",
    blood_group: "O-",
    mobile: "9876543215",
  },
];

async function main() {
  console.log("=== Bonami Software Seed Script ===\n");

  // ── 1. Insert dummy users in master DB ────────────────────────────────────
  console.log("── Step 1: Users in master DB ──\n");
  const insertedUserIds: string[] = [];

  for (const u of DUMMY_USERS) {
    let doc = await findOne(masterPrisma, "users", { username: u.username });
    if (doc) {
      const id = extractId(doc);
      insertedUserIds.push(id);
      console.log(`  ${u.username}: already exists (${id})`);
      continue;
    }
    const now = new Date();
    await rm({
      insert: "users",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          username: u.username,
          email: u.email,
          official_email: u.official_email,
          first_name: u.first_name,
          last_name: u.last_name,
          designation: u.designation,
          department: u.department,
          role: u.role,
          permissions: [],
          isSuperUser: false,
          wfh: false,
          assets: [],
          employeeStatus: "Active",
          salary: u.salary,
          salaryBasicPay: u.salaryBasicPay,
          salaryHra: u.salaryHra,
          salaryConveyance: u.salaryConveyance,
          salaryPf: u.salaryPf,
          salaryEsi: u.salaryEsi,
          salaryPt: u.salaryPt,
          kyc_approval: u.kyc_approval,
          kyc_date: now,
          joining_date: u.joining_date,
          blood_group: u.blood_group,
          mobile: u.mobile,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    doc = await findOne(masterPrisma, "users", { username: u.username });
    const id = extractId(doc);
    insertedUserIds.push(id);
    console.log(`  ${u.username}: inserted (${id})`);
  }

  // ── 2. Tenant memberships ────────────────────────────────────────────────
  console.log("\n── Step 2: Tenant memberships ──\n");
  for (let i = 0; i < DUMMY_USERS.length; i++) {
    const userId = insertedUserIds[i];
    const u = DUMMY_USERS[i];
    const existing = await findOne(masterPrisma, "tenant_memberships", {
      tenantId: oid(BONAMI_TENANT_ID),
      userId: oid(userId),
    });
    if (existing) {
      console.log(`  ${u.username}: membership exists`);
      continue;
    }
    const role =
      u.role.includes("hr") || u.role.includes("manager") ? "hr" : "employee";
    await rm({
      insert: "tenant_memberships",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          userId: oid(userId),
          role,
          joinedAt: new Date(),
        },
      ],
    });
    console.log(`  ${u.username}: membership created as "${role}"`);
  }

  // All Bonami user IDs including the owner
  const allBonamiRes = await rm({
    find: "users",
    filter: { tenantId: oid(BONAMI_TENANT_ID) },
    limit: 100,
  });
  const allUsers: Array<{
    id: string;
    name: string;
    department: string;
    salary: number;
    salaryBasicPay: number;
    salaryHra: number;
    salaryConveyance: number;
    salaryPf: number;
    salaryEsi: number;
    salaryPt: number;
  }> = [];
  for (const doc of allBonamiRes?.cursor?.firstBatch ?? []) {
    allUsers.push({
      id: extractId(doc),
      name:
        `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() || doc.username,
      department: doc.department ?? "Engineering",
      salary: doc.salary ?? 60000,
      salaryBasicPay: doc.salaryBasicPay ?? 30000,
      salaryHra: doc.salaryHra ?? 12000,
      salaryConveyance: doc.salaryConveyance ?? 2000,
      salaryPf: doc.salaryPf ?? 3600,
      salaryEsi: doc.salaryEsi ?? 0,
      salaryPt: doc.salaryPt ?? 200,
    });
  }
  // Make sure we have priya as HR
  const hrUserId = insertedUserIds[0]; // priya_sharma_bonami
  const nonHrUserIds = allUsers
    .map((u) => u.id)
    .filter((id) => id !== hrUserId);

  console.log(`\n  Total Bonami users: ${allUsers.length}`);

  // ── 3. Seed business data in hrms-bonami-software ─────────────────────────
  console.log("\n── Step 3: Business collections ──\n");

  // ─ Roles ──────────────────────────────────────────────────────────────────
  if ((await countDocs("roles")) === 0) {
    await rb({
      insert: "roles",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Admin",
          permissions: [
            "manage_users",
            "view_reports",
            "manage_payroll",
            "manage_leaves",
            "manage_attendance",
            "manage_policies",
          ],
          assignedTo: [],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "HR",
          permissions: [
            "manage_users",
            "manage_leaves",
            "manage_attendance",
            "view_reports",
            "manage_policies",
          ],
          assignedTo: [oid(hrUserId)],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Employee",
          permissions: ["view_own_data", "apply_leave", "mark_attendance"],
          assignedTo: nonHrUserIds.map(oid),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Manager",
          permissions: [
            "view_team",
            "approve_leaves",
            "view_reports",
            "manage_attendance",
          ],
          assignedTo: [],
        },
      ],
    });
    console.log("  roles: 4 inserted");
  } else {
    console.log("  roles: skipped (has data)");
  }

  // ─ Holidays ────────────────────────────────────────────────────────────────
  if ((await countDocs("holidays")) === 0) {
    await rb({
      insert: "holidays",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 1,
          holidays: [
            { date: "2025-01-26", name: "Republic Day", type: "National" },
          ],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 3,
          holidays: [{ date: "2025-03-14", name: "Holi", type: "Festival" }],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 4,
          holidays: [
            {
              date: "2025-04-14",
              name: "Dr. Ambedkar Jayanti",
              type: "National",
            },
            { date: "2025-04-18", name: "Good Friday", type: "National" },
          ],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 8,
          holidays: [
            { date: "2025-08-15", name: "Independence Day", type: "National" },
            { date: "2025-08-27", name: "Janmashtami", type: "Festival" },
          ],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 10,
          holidays: [
            { date: "2025-10-02", name: "Gandhi Jayanti", type: "National" },
            { date: "2025-10-20", name: "Dussehra", type: "Festival" },
          ],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 11,
          holidays: [{ date: "2025-11-05", name: "Diwali", type: "Festival" }],
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          year: 2025,
          month: 12,
          holidays: [
            { date: "2025-12-25", name: "Christmas", type: "National" },
          ],
        },
      ],
    });
    console.log("  holidays: 7 months inserted");
  } else {
    console.log("  holidays: skipped (has data)");
  }

  // ─ Policies ───────────────────────────────────────────────────────────────
  if ((await countDocs("policies")) === 0) {
    await rb({
      insert: "policies",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          policyType: "Leave Policy",
          policyName: "Annual Leave Policy",
          content:
            "Employees are entitled to 24 days of paid leave per year. Casual leave: 8 days, Sick leave: 8 days, Earned leave: 8 days. Leave must be applied at least 2 days in advance except for sick leave.",
          status: "Active",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(90),
          lastUpdatedOn: daysAgo(90),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          policyType: "Attendance Policy",
          policyName: "Work Hours & Attendance",
          content:
            "Standard work hours are 9:00 AM to 6:00 PM, Monday through Friday. Employees must mark attendance via the HRMS portal. WFH is permitted up to 2 days per week with manager approval.",
          status: "Active",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(90),
          lastUpdatedOn: daysAgo(30),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          policyType: "Code of Conduct",
          policyName: "Employee Code of Conduct",
          content:
            "All employees are expected to maintain professional behavior, treat colleagues with respect, protect company data, and adhere to information security guidelines. Any violation will be subject to disciplinary action.",
          status: "Active",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(90),
          lastUpdatedOn: daysAgo(90),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          policyType: "Salary Policy",
          policyName: "Payroll & Disbursement",
          content:
            "Salaries are disbursed on the last working day of every month. Salary slips are available in the HRMS portal by the 5th of the following month. Any discrepancies must be raised within 10 days of receipt.",
          status: "Active",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(60),
          lastUpdatedOn: daysAgo(60),
        },
      ],
    });
    console.log("  policies: 4 inserted");
  } else {
    console.log("  policies: skipped (has data)");
  }

  // ─ Rules ──────────────────────────────────────────────────────────────────
  if ((await countDocs("rules")) === 0) {
    await rb({
      insert: "rules",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Auto-reject late clock-in",
          category: "Attendance",
          description:
            "Automatically mark absent if clock-in is after 11:00 AM without prior approval.",
          priority: 1,
          status: "active",
          tags: ["attendance", "automation"],
          conditions: {
            field: "clockInTime",
            operator: "greaterThan",
            value: "11:00",
          },
          conditionLogic: "AND",
          actions: [{ type: "setStatus", value: "Late" }],
          effectiveFrom: daysAgo(60),
          createdBy: hrUserId,
          executionCount: 45,
          createdAt: daysAgo(60),
          updatedAt: daysAgo(1),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Leave balance deduction",
          category: "Leave",
          description:
            "Deduct from earned leave balance when approved leave is taken.",
          priority: 2,
          status: "active",
          tags: ["leave", "balance"],
          conditions: {
            field: "leaveStatus",
            operator: "equals",
            value: "Approved",
          },
          conditionLogic: "AND",
          actions: [{ type: "deductBalance", field: "earnedLeave" }],
          effectiveFrom: daysAgo(90),
          createdBy: hrUserId,
          executionCount: 23,
          createdAt: daysAgo(90),
          updatedAt: daysAgo(5),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          name: "Probation period alert",
          category: "HR",
          description:
            "Notify HR 30 days before employee probation period ends.",
          priority: 3,
          status: "active",
          tags: ["hr", "probation", "notification"],
          conditions: {
            field: "probationEndDate",
            operator: "daysUntil",
            value: 30,
          },
          conditionLogic: "AND",
          actions: [{ type: "sendNotification", recipients: ["hr"] }],
          effectiveFrom: daysAgo(60),
          createdBy: OWNER_USER_ID,
          executionCount: 5,
          createdAt: daysAgo(60),
          updatedAt: daysAgo(60),
        },
      ],
    });
    console.log("  rules: 3 inserted");
  } else {
    console.log("  rules: skipped (has data)");
  }

  // ─ Teams ──────────────────────────────────────────────────────────────────
  if ((await countDocs("teams")) === 0) {
    const engUsers = allUsers
      .filter((u) => u.department === "Engineering")
      .map((u) => oid(u.id));
    const otherUsers = allUsers
      .filter((u) => u.department !== "Engineering")
      .map((u) => oid(u.id));
    await rb({
      insert: "teams",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          teamName: "Engineering",
          teamLeaderId: oid(insertedUserIds[1] ?? OWNER_USER_ID),
          members: engUsers,
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          teamName: "Operations",
          teamLeaderId: oid(OWNER_USER_ID),
          members: otherUsers,
        },
      ],
    });
    console.log("  teams: 2 inserted");
  } else {
    console.log("  teams: skipped (has data)");
  }

  // ─ HR Activities ──────────────────────────────────────────────────────────
  if ((await countDocs("hractivities")) === 0) {
    await rb({
      insert: "hractivities",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          title: "Q1 Performance Reviews",
          description:
            "Conduct performance reviews for all employees for Q1 2025.",
          scheduledAt: daysAgo(60),
          status: "Completed",
          createdBy: hrUserId,
          createdOn: daysAgo(90),
          lastUpdatedOn: daysAgo(55),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          title: "Team Building Workshop",
          description:
            "Half-day team building activity for the entire company.",
          scheduledAt: daysAgo(30),
          status: "Completed",
          createdBy: hrUserId,
          createdOn: daysAgo(50),
          lastUpdatedOn: daysAgo(28),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          title: "Annual Appraisal Cycle",
          description:
            "Initiate annual appraisal cycle. Collect self-assessments and manager feedback.",
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "Scheduled",
          createdBy: hrUserId,
          createdOn: daysAgo(10),
          lastUpdatedOn: daysAgo(10),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          title: "New Employee Onboarding - Kavya Nair",
          description:
            "Onboarding session for new DevOps Engineer joining May 2024.",
          scheduledAt: new Date("2024-05-20"),
          status: "Completed",
          createdBy: hrUserId,
          createdOn: new Date("2024-05-15"),
          lastUpdatedOn: new Date("2024-05-21"),
        },
      ],
    });
    console.log("  hractivities: 4 inserted");
  } else {
    console.log("  hractivities: skipped (has data)");
  }

  // ─ Attendance records (90 days of weekdays per user) ──────────────────────
  const existingAttendance = await countDocs("attendance_records");
  if (existingAttendance < 10) {
    const days = workdays(90, 1);
    const attendanceDocs: any[] = [];
    for (const user of allUsers) {
      for (const day of days) {
        const absent = Math.random() < 0.04; // 4% chance absent
        const late = !absent && Math.random() < 0.08; // 8% chance late
        const timeInHour = late ? 10 + Math.floor(Math.random() * 2) : 9;
        const timeInMin = late
          ? Math.floor(Math.random() * 59)
          : Math.floor(Math.random() * 30);
        const timeIn = new Date(day);
        timeIn.setHours(timeInHour, timeInMin, 0, 0);
        const timeOut = new Date(day);
        timeOut.setHours(
          18 + Math.floor(Math.random() * 2),
          Math.floor(Math.random() * 59),
          0,
          0,
        );
        const workingHours = absent
          ? 0
          : parseFloat(
              ((timeOut.getTime() - timeIn.getTime()) / 3600000).toFixed(2),
            );

        attendanceDocs.push({
          tenantId: oid(BONAMI_TENANT_ID),
          userId: oid(user.id),
          date: day,
          timeIn: absent ? null : timeIn,
          timeOut: absent ? null : timeOut,
          workingHours,
          status: absent ? "Absent" : late ? "Late" : "Present",
          isCorrected: false,
        });
      }
    }
    // Insert in batches of 500
    let inserted = 0;
    for (let i = 0; i < attendanceDocs.length; i += 500) {
      const batch = attendanceDocs.slice(i, i + 500);
      const res = await rb({ insert: "attendance_records", documents: batch });
      inserted += res?.n ?? batch.length;
    }
    console.log(
      `  attendance_records: ${inserted} inserted (${allUsers.length} users × ~${days.length} days)`,
    );
  } else {
    console.log(
      `  attendance_records: skipped (has ${existingAttendance} records)`,
    );
  }

  // ─ Leaves ─────────────────────────────────────────────────────────────────
  if ((await countDocs("leaves")) === 0) {
    const leaveDocs: any[] = [];
    const leaveTypes = ["Casual Leave", "Sick Leave", "Earned Leave"];
    for (const user of allUsers) {
      // 2 approved leaves in the past
      leaveDocs.push({
        tenantId: oid(BONAMI_TENANT_ID),
        userId: oid(user.id),
        from: daysAgo(70),
        to: daysAgo(69),
        leaveType: "Casual Leave",
        days: 2,
        status: "Approved",
        reason: "Personal work",
        appliedOn: daysAgo(72),
        approvedById: oid(hrUserId),
        approvedOn: daysAgo(71),
      });
      leaveDocs.push({
        tenantId: oid(BONAMI_TENANT_ID),
        userId: oid(user.id),
        from: daysAgo(40),
        to: daysAgo(40),
        leaveType: "Sick Leave",
        days: 1,
        status: "Approved",
        reason: "Fever and cold",
        sickLeave: true,
        appliedOn: daysAgo(40),
        approvedById: oid(hrUserId),
        approvedOn: daysAgo(40),
      });
    }
    // One pending leave for first non-owner user
    if (nonHrUserIds.length > 0) {
      leaveDocs.push({
        tenantId: oid(BONAMI_TENANT_ID),
        userId: oid(nonHrUserIds[0]),
        from: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        leaveType: "Earned Leave",
        days: 3,
        status: "Pending",
        reason: "Family function",
        appliedOn: new Date(),
      });
    }
    await rb({ insert: "leaves", documents: leaveDocs });
    console.log(`  leaves: ${leaveDocs.length} inserted`);
  } else {
    console.log("  leaves: skipped (has data)");
  }

  // ─ Leave Balances ─────────────────────────────────────────────────────────
  if ((await countDocs("leavebalances")) === 0) {
    await rb({
      insert: "leavebalances",
      documents: allUsers.map((user) => ({
        tenantId: oid(BONAMI_TENANT_ID),
        userId: oid(user.id),
        accumulatedPLBeforeCurrentMonth: 4,
        balances: { casualLeave: 6, sickLeave: 7, earnedLeave: 5 },
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
    console.log(`  leavebalances: ${allUsers.length} inserted`);
  } else {
    console.log("  leavebalances: skipped (has data)");
  }

  // ─ Salary Structures (3 months: Feb, Mar, Apr 2025) ───────────────────────
  if ((await countDocs("salarystructures")) === 0) {
    const salaryDocs: any[] = [];
    const months = [
      { month: 2, year: 2025 },
      { month: 3, year: 2025 },
      { month: 4, year: 2025 },
    ];
    for (const user of allUsers) {
      for (const { month, year } of months) {
        const grossEarnings =
          user.salaryBasicPay + user.salaryHra + user.salaryConveyance;
        const deductions = user.salaryPf + user.salaryEsi + user.salaryPt;
        salaryDocs.push({
          tenantId: oid(BONAMI_TENANT_ID),
          userId: oid(user.id),
          grossSalary: user.salary,
          month,
          year,
          basicPay: user.salaryBasicPay,
          hra: user.salaryHra,
          conveyance: user.salaryConveyance,
          incentive: 0,
          pf: user.salaryPf,
          esi: user.salaryEsi,
          pt: user.salaryPt,
          deductions,
          grossEarnings,
          netPayable: grossEarnings - deductions,
          createdAt: new Date(year, month - 1, 28),
          updatedAt: new Date(year, month - 1, 28),
        });
      }
    }
    await rb({ insert: "salarystructures", documents: salaryDocs });
    console.log(`  salarystructures: ${salaryDocs.length} inserted`);
  } else {
    console.log("  salarystructures: skipped (has data)");
  }

  // ─ Notifications + Recipients ─────────────────────────────────────────────
  if ((await countDocs("notifications")) === 0) {
    const notifDocs = [
      {
        tenantId: oid(BONAMI_TENANT_ID),
        title: "Welcome to Bonami Software HRMS",
        message:
          "Your HRMS portal is now live. Explore attendance, leave management, and more.",
        timeStamp: daysAgo(85),
        eventType: "general",
        priority: "high",
      },
      {
        tenantId: oid(BONAMI_TENANT_ID),
        title: "Q1 Performance Review Due",
        message:
          "Please complete your self-assessment for Q1 performance review by end of this week.",
        timeStamp: daysAgo(65),
        eventType: "hr",
        priority: "medium",
      },
      {
        tenantId: oid(BONAMI_TENANT_ID),
        title: "Holiday: Dussehra",
        message:
          "The office will be closed on October 20th for Dussehra. Enjoy the festive break!",
        timeStamp: daysAgo(30),
        eventType: "holiday",
        priority: "low",
      },
    ];
    await rb({ insert: "notifications", documents: notifDocs });
    // Query back to get IDs
    const insertedNotifs =
      (
        await rb({
          find: "notifications",
          filter: { tenantId: oid(BONAMI_TENANT_ID) },
          limit: 10,
        })
      )?.cursor?.firstBatch ?? [];
    const recipientDocs: any[] = [];
    for (const notif of insertedNotifs) {
      const nid = extractId(notif);
      for (const user of allUsers) {
        recipientDocs.push({
          tenantId: oid(BONAMI_TENANT_ID),
          notificationId: oid(nid),
          userId: oid(user.id),
          isCleared: Math.random() < 0.5,
        });
      }
    }
    await rb({ insert: "notification_recipients", documents: recipientDocs });
    console.log(
      `  notifications: ${notifDocs.length} inserted, recipients: ${recipientDocs.length}`,
    );
  } else {
    console.log("  notifications: skipped (has data)");
  }

  // ─ Job Openings + Applications ────────────────────────────────────────────
  if ((await countDocs("jobopenings")) === 0) {
    await rb({
      insert: "jobopenings",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          jobTitle: "Full Stack Developer",
          numberOfVacancies: 2,
          jobPostingDate: daysAgo(30),
          applicationDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          jobDescription:
            "Looking for an experienced Full Stack Developer proficient in React and Node.js to join our Engineering team.",
          requiredSkills: "React, Node.js, MongoDB, TypeScript, REST APIs",
          experience: 3,
          budget: [800000, 1200000],
          department: "Engineering",
          hiringManager: "Sameer Yadav",
          candidatesHired: 0,
          status: "Open",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(30),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          jobTitle: "Sales Manager",
          numberOfVacancies: 1,
          jobPostingDate: daysAgo(15),
          applicationDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
          jobDescription:
            "Seeking a driven Sales Manager to lead and expand our sales team. Experience in B2B SaaS sales preferred.",
          requiredSkills:
            "B2B Sales, CRM tools, Team Leadership, Communication",
          experience: 5,
          budget: [1000000, 1500000],
          department: "Sales",
          hiringManager: "Sameer Yadav",
          candidatesHired: 0,
          status: "Open",
          createdBy: OWNER_USER_ID,
          createdOn: daysAgo(15),
        },
      ],
    });
    const openings =
      (
        await rb({
          find: "jobopenings",
          filter: { tenantId: oid(BONAMI_TENANT_ID) },
          limit: 10,
        })
      )?.cursor?.firstBatch ?? [];
    if (openings.length > 0) {
      const fsOpeningId = extractId(openings[0]);
      await rb({
        insert: "jobapplications",
        documents: [
          {
            tenantId: oid(BONAMI_TENANT_ID),
            jobTitleId: oid(fsOpeningId),
            name: "Ankit Bhatt",
            mobile: "9988776655",
            email: "ankit.bhatt@example.com",
            status: "Interview Scheduled",
            resumeScore: 82,
            aiNotes:
              "Strong React skills, 4 years experience. Good cultural fit.",
            interviews: [
              {
                round: 1,
                scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
                status: "Scheduled",
              },
            ],
          },
          {
            tenantId: oid(BONAMI_TENANT_ID),
            jobTitleId: oid(fsOpeningId),
            name: "Sneha Pillai",
            mobile: "9977665544",
            email: "sneha.pillai@example.com",
            status: "Applied",
            resumeScore: 74,
            aiNotes: "Solid Node.js background, limited TypeScript experience.",
            interviews: [],
          },
          {
            tenantId: oid(BONAMI_TENANT_ID),
            jobTitleId: oid(fsOpeningId),
            name: "Vikas Tiwari",
            mobile: "9966554433",
            email: "vikas.tiwari@example.com",
            status: "Rejected",
            resumeScore: 45,
            aiNotes: "Does not meet minimum experience requirements.",
            reason: "Below minimum experience threshold",
            interviews: [],
          },
        ],
      });
    }
    console.log("  jobopenings: 2 inserted, jobapplications: 3 inserted");
  } else {
    console.log("  jobopenings: skipped (has data)");
  }

  // ─ Chatrooms + Messages ───────────────────────────────────────────────────
  if ((await countDocs("chatrooms")) === 0) {
    const now = new Date();
    // General channel
    await rb({
      insert: "chatrooms",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          type: "group",
          name: "General",
          participants: allUsers.map((u) => oid(u.id)),
          deletedFor: [],
          lastActivity: daysAgo(1),
          createdAt: daysAgo(85),
          updatedAt: daysAgo(1),
        },
      ],
    });
    const rooms =
      (
        await rb({
          find: "chatrooms",
          filter: { tenantId: oid(BONAMI_TENANT_ID) },
          limit: 10,
        })
      )?.cursor?.firstBatch ?? [];
    if (rooms.length > 0) {
      const roomId = extractId(rooms[0]);
      const msgDocs = [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          chatRoomId: oid(roomId),
          senderId: oid(OWNER_USER_ID),
          content: "Welcome everyone to Bonami Software HRMS! 🎉",
          type: "text",
          readBy: allUsers.map((u) => oid(u.id)),
          isDeleted: false,
          createdAt: daysAgo(85),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          chatRoomId: oid(roomId),
          senderId: oid(hrUserId),
          content:
            "Hi team! Please complete your attendance regularization for last month.",
          type: "text",
          readBy: allUsers.map((u) => oid(u.id)),
          isDeleted: false,
          createdAt: daysAgo(30),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          chatRoomId: oid(roomId),
          senderId: oid(insertedUserIds[1] ?? OWNER_USER_ID),
          content:
            "Sure, will do. Also, when are the salary slips for April being uploaded?",
          type: "text",
          readBy: allUsers.map((u) => oid(u.id)),
          isDeleted: false,
          createdAt: daysAgo(29),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          chatRoomId: oid(roomId),
          senderId: oid(hrUserId),
          content:
            "April salary slips will be available by May 5th. Please check the portal.",
          type: "text",
          readBy: allUsers.map((u) => oid(u.id)),
          isDeleted: false,
          createdAt: daysAgo(29),
        },
        {
          tenantId: oid(BONAMI_TENANT_ID),
          chatRoomId: oid(roomId),
          senderId: oid(OWNER_USER_ID),
          content:
            "Team building workshop this Friday at 2 PM. Please block your calendars!",
          type: "text",
          readBy: allUsers.slice(0, 3).map((u) => oid(u.id)),
          isDeleted: false,
          createdAt: daysAgo(3),
        },
      ];
      await rb({ insert: "messages", documents: msgDocs });
      // Update lastMessageId
      const lastMsgRes =
        (
          await rb({
            find: "messages",
            filter: { chatRoomId: oid(roomId) },
            sort: { createdAt: -1 },
            limit: 1,
          })
        )?.cursor?.firstBatch ?? [];
      if (lastMsgRes.length > 0) {
        await rb({
          update: "chatrooms",
          updates: [
            {
              q: { _id: oid(roomId) },
              u: { $set: { lastMessageId: lastMsgRes[0]._id } },
              multi: false,
            },
          ],
        });
      }
      console.log(
        `  chatrooms: 1 inserted, messages: ${msgDocs.length} inserted`,
      );
    }
  } else {
    console.log("  chatrooms: skipped (has data)");
  }

  // ─ Audit Logs ────────────────────────────────────────────────────────────
  if ((await countDocs("auditlogs")) === 0) {
    const auditDocs: any[] = [];
    const actions = [
      { action: "LOGIN", entityType: "User", description: "User logged in" },
      {
        action: "UPDATE_PROFILE",
        entityType: "User",
        description: "User updated profile",
      },
      {
        action: "APPLY_LEAVE",
        entityType: "Leave",
        description: "Leave application submitted",
      },
      {
        action: "APPROVE_LEAVE",
        entityType: "Leave",
        description: "Leave application approved",
      },
      {
        action: "MARK_ATTENDANCE",
        entityType: "Attendance",
        description: "Attendance marked",
      },
    ];
    for (const user of allUsers) {
      for (let i = 0; i < 8; i++) {
        const a = actions[i % actions.length];
        auditDocs.push({
          tenantId: oid(BONAMI_TENANT_ID),
          userId: oid(user.id),
          action: a.action,
          entityType: a.entityType,
          description: a.description,
          ipAddress: `192.168.1.${10 + Math.floor(Math.random() * 50)}`,
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          timestamp: daysAgo(Math.floor(Math.random() * 60)),
        });
      }
    }
    await rb({ insert: "auditlogs", documents: auditDocs });
    console.log(`  auditlogs: ${auditDocs.length} inserted`);
  } else {
    console.log("  auditlogs: skipped (has data)");
  }

  // ─ Resignations ───────────────────────────────────────────────────────────
  if ((await countDocs("resignations")) === 0) {
    // One withdrawn resignation to make data interesting
    await rb({
      insert: "resignations",
      documents: [
        {
          tenantId: oid(BONAMI_TENANT_ID),
          userId: oid(insertedUserIds[3] ?? nonHrUserIds[0] ?? OWNER_USER_ID), // rahul_verma
          resignationDate: daysAgo(45),
          lastWorkingDay: daysAgo(15),
          reason: "Better opportunity",
          comments:
            "I have received an offer with a higher compensation package.",
          overallJobSatisfaction: 4,
          qualityOfCommunication: "Excellent",
          supportFromManager: "Good",
          appreciationForWork: "Good",
          collaborationWithinTheTeam: "Excellent",
          overallCompanyCulture: "Good",
          suggestions: "Consider implementing flexible working hours.",
          status: "Withdrawn",
          submittedOn: daysAgo(45),
          withdrawnOn: daysAgo(30),
          lastUpdatedOn: daysAgo(30),
        },
      ],
    });
    console.log("  resignations: 1 inserted");
  } else {
    console.log("  resignations: skipped (has data)");
  }

  console.log("\n✓ Bonami Software seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
    await bonamiPrisma.$disconnect();
  });
