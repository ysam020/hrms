/**
 * Re-seeds Bonami Software business collections using Prisma ORM (not $runCommandRaw).
 * Prisma ORM uses the bson library which correctly converts JS Date → BSON Date.
 *
 * Deletes and recreates: hractivities, jobopenings, jobapplications,
 * leaves, leavebalances, salarystructures, notifications, notification_recipients,
 * roles, policies, rules, teams, chatrooms, messages, auditlogs, resignations.
 *
 * Does NOT touch: attendance_records, login_events, _init
 *
 * Usage:
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm --filter=@hrms/db exec tsx src/reseed-bonami-orm.ts
 */

import { PrismaClient } from "@prisma/client";

const BONAMI_TENANT_ID = "6a0bd765f9ff1bdc7c809931";
const BONAMI_DB = "hrms-bonami-software";
const OWNER_USER_ID = "6a0bd761fb9690a2894c1cb6"; // sameer_yadav1 (owner)

const masterPrisma = new PrismaClient({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

// Direct Prisma ORM client to the tenant DB — uses bson library, handles DateTime correctly
const bp = new PrismaClient({ datasourceUrl: buildUrl(BONAMI_DB) });
const rb = (cmd: Record<string, unknown>): Promise<any> =>
  (bp.$runCommandRaw as any)(cmd);

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(18, 0, 0, 0);
  return d;
}

async function main() {
  console.log("=== Re-seed Bonami Software (Prisma ORM) ===\n");

  // Fetch all Bonami users from master DB
  const rm = (cmd: Record<string, unknown>): Promise<any> =>
    (masterPrisma.$runCommandRaw as any)(cmd);
  const usersRes = await rm({
    find: "users",
    filter: { tenantId: { $oid: BONAMI_TENANT_ID } },
    limit: 20,
  });
  const allUsers: Array<{
    id: string;
    first_name: string;
    last_name: string;
    department: string;
    salary: number;
    salaryBasicPay: number;
    salaryHra: number;
    salaryConveyance: number;
    salaryPf: number;
    salaryEsi: number;
    salaryPt: number;
  }> = (usersRes?.cursor?.firstBatch ?? []).map((u: any) => ({
    id: u._id?.$oid ?? String(u._id),
    first_name: u.first_name ?? "",
    last_name: u.last_name ?? "",
    department: u.department ?? "Engineering",
    salary: u.salary ?? 60000,
    salaryBasicPay: u.salaryBasicPay ?? 30000,
    salaryHra: u.salaryHra ?? 12000,
    salaryConveyance: u.salaryConveyance ?? 2000,
    salaryPf: u.salaryPf ?? 3600,
    salaryEsi: u.salaryEsi ?? 0,
    salaryPt: u.salaryPt ?? 200,
  }));

  const hrUserId =
    allUsers.find((u) => u.department === "Human Resources")?.id ??
    allUsers[0]?.id ??
    OWNER_USER_ID;
  const nonOwnerIds = allUsers
    .map((u) => u.id)
    .filter((id) => id !== OWNER_USER_ID);

  console.log(`Found ${allUsers.length} Bonami users. HR: ${hrUserId}\n`);

  // ── Roles ──────────────────────────────────────────────────────────────────
  await bp.role.deleteMany({});
  await bp.role.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
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
        tenantId: BONAMI_TENANT_ID,
        name: "HR",
        permissions: [
          "manage_users",
          "manage_leaves",
          "manage_attendance",
          "view_reports",
          "manage_policies",
        ],
        assignedTo: [hrUserId],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        name: "Employee",
        permissions: ["view_own_data", "apply_leave", "mark_attendance"],
        assignedTo: nonOwnerIds,
      },
      {
        tenantId: BONAMI_TENANT_ID,
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
  console.log("  roles: 4 recreated");

  // ── Holidays ───────────────────────────────────────────────────────────────
  await bp.holiday.deleteMany({});
  await bp.holiday.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 1,
        holidays: [
          { date: "2026-01-26", name: "Republic Day", type: "National" },
        ],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 3,
        holidays: [{ date: "2026-03-25", name: "Holi", type: "Festival" }],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 4,
        holidays: [
          {
            date: "2026-04-14",
            name: "Dr. Ambedkar Jayanti",
            type: "National",
          },
          { date: "2026-04-03", name: "Good Friday", type: "National" },
        ],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 8,
        holidays: [
          { date: "2026-08-15", name: "Independence Day", type: "National" },
          { date: "2026-08-16", name: "Janmashtami", type: "Festival" },
        ],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 10,
        holidays: [
          { date: "2026-10-02", name: "Gandhi Jayanti", type: "National" },
          { date: "2026-10-09", name: "Dussehra", type: "Festival" },
        ],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 11,
        holidays: [{ date: "2026-11-28", name: "Diwali", type: "Festival" }],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        year: 2026,
        month: 12,
        holidays: [{ date: "2026-12-25", name: "Christmas", type: "National" }],
      },
    ],
  });
  console.log("  holidays: 7 months recreated");

  // ── Policies ───────────────────────────────────────────────────────────────
  await bp.policy.deleteMany({});
  await bp.policy.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
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
        tenantId: BONAMI_TENANT_ID,
        policyType: "Attendance Policy",
        policyName: "Work Hours & Attendance",
        content:
          "Standard work hours are 9:00 AM to 6:00 PM, Monday through Friday. WFH is permitted up to 2 days per week with manager approval.",
        status: "Active",
        createdBy: OWNER_USER_ID,
        createdOn: daysAgo(90),
        lastUpdatedOn: daysAgo(30),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        policyType: "Code of Conduct",
        policyName: "Employee Code of Conduct",
        content:
          "All employees are expected to maintain professional behavior, treat colleagues with respect, protect company data, and adhere to information security guidelines.",
        status: "Active",
        createdBy: OWNER_USER_ID,
        createdOn: daysAgo(90),
        lastUpdatedOn: daysAgo(90),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        policyType: "Salary Policy",
        policyName: "Payroll & Disbursement",
        content:
          "Salaries are disbursed on the last working day of every month. Salary slips are available in the HRMS portal by the 5th of the following month.",
        status: "Active",
        createdBy: OWNER_USER_ID,
        createdOn: daysAgo(60),
        lastUpdatedOn: daysAgo(60),
      },
    ],
  });
  console.log("  policies: 4 recreated");

  // ── Rules ──────────────────────────────────────────────────────────────────
  await bp.rule.deleteMany({});
  await bp.rule.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
        name: "Auto-reject late clock-in",
        category: "Attendance",
        description:
          "Automatically mark late if clock-in is after 11:00 AM without prior approval.",
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
        executionCount: 45,
        createdBy: hrUserId,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(1),
      },
      {
        tenantId: BONAMI_TENANT_ID,
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
        executionCount: 23,
        createdBy: hrUserId,
        createdAt: daysAgo(90),
        updatedAt: daysAgo(5),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        name: "Probation period alert",
        category: "HR",
        description: "Notify HR 30 days before employee probation period ends.",
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
        executionCount: 5,
        createdBy: OWNER_USER_ID,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(60),
      },
    ],
  });
  console.log("  rules: 3 recreated");

  // ── Teams ──────────────────────────────────────────────────────────────────
  await bp.team.deleteMany({});
  const engUsers = allUsers
    .filter((u) => u.department === "Engineering")
    .map((u) => u.id);
  const otherUsers = allUsers
    .filter((u) => u.department !== "Engineering")
    .map((u) => u.id);
  await bp.team.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
        teamName: "Engineering",
        teamLeaderId: nonOwnerIds[1] ?? OWNER_USER_ID,
        members: engUsers,
      },
      {
        tenantId: BONAMI_TENANT_ID,
        teamName: "Operations",
        teamLeaderId: OWNER_USER_ID,
        members: otherUsers,
      },
    ],
  });
  console.log("  teams: 2 recreated");

  // ── HR Activities — use "Active" for future, "Completed" for past ──────────
  await bp.hrActivity.deleteMany({});
  await bp.hrActivity.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
        title: "Q1 Performance Reviews",
        description:
          "Conduct performance reviews for all employees for Q1 2026.",
        scheduledAt: daysAgo(50),
        status: "Completed",
        createdBy: hrUserId,
        createdOn: daysAgo(70),
        lastUpdatedOn: daysAgo(45),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        title: "Team Building Workshop",
        description:
          "Half-day team building activity for the entire Bonami Software team.",
        scheduledAt: daysAgo(20),
        status: "Completed",
        createdBy: hrUserId,
        createdOn: daysAgo(40),
        lastUpdatedOn: daysAgo(18),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        title: "Annual Appraisal Cycle 2026",
        description:
          "Initiate annual appraisal cycle. Collect self-assessments and manager feedback for all employees.",
        scheduledAt: daysFromNow(14),
        status: "Active",
        createdBy: hrUserId,
        createdOn: daysAgo(5),
        lastUpdatedOn: daysAgo(5),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        title: "New Hire Onboarding — Kavya Nair",
        description:
          "Onboarding session for DevOps Engineer joining in May 2024.",
        scheduledAt: new Date("2024-05-20T09:00:00.000Z"),
        status: "Completed",
        createdBy: hrUserId,
        createdOn: new Date("2024-05-15T09:00:00.000Z"),
        lastUpdatedOn: new Date("2024-05-21T09:00:00.000Z"),
      },
      {
        tenantId: BONAMI_TENANT_ID,
        title: "Mid-Year Review — Engineering Team",
        description:
          "Mid-year performance review and goal alignment for the engineering team.",
        scheduledAt: daysFromNow(30),
        status: "Active",
        createdBy: hrUserId,
        createdOn: daysAgo(3),
        lastUpdatedOn: daysAgo(3),
      },
    ],
  });
  console.log("  hractivities: 5 recreated (2 Active, 3 Completed)");

  // ── Leaves ─────────────────────────────────────────────────────────────────
  await bp.leaveApplication.deleteMany({});
  const leaveDocs: any[] = [];
  for (const user of allUsers) {
    leaveDocs.push({
      tenantId: BONAMI_TENANT_ID,
      userId: user.id,
      from: daysAgo(70),
      to: daysAgo(69),
      leaveType: "Casual Leave",
      days: 2,
      status: "Approved",
      reason: "Personal work",
      appliedOn: daysAgo(72),
      approvedById: hrUserId,
      approvedOn: daysAgo(71),
    });
    leaveDocs.push({
      tenantId: BONAMI_TENANT_ID,
      userId: user.id,
      from: daysAgo(30),
      to: daysAgo(30),
      leaveType: "Sick Leave",
      days: 1,
      status: "Approved",
      reason: "Fever",
      sickLeave: true,
      appliedOn: daysAgo(30),
      approvedById: hrUserId,
      approvedOn: daysAgo(30),
    });
  }
  // Add one pending leave for first non-owner user
  if (nonOwnerIds.length > 0) {
    leaveDocs.push({
      tenantId: BONAMI_TENANT_ID,
      userId: nonOwnerIds[0],
      from: daysFromNow(5),
      to: daysFromNow(7),
      leaveType: "Earned Leave",
      days: 3,
      status: "Pending",
      reason: "Family function",
      appliedOn: new Date(),
    });
  }
  await bp.leaveApplication.createMany({ data: leaveDocs });
  console.log(`  leaves: ${leaveDocs.length} recreated`);

  // ── Leave Balances ─────────────────────────────────────────────────────────
  await bp.leaveBalance.deleteMany({});
  await bp.leaveBalance.createMany({
    data: allUsers.map((u) => ({
      tenantId: BONAMI_TENANT_ID,
      userId: u.id,
      accumulatedPLBeforeCurrentMonth: 4,
      balances: { casualLeave: 6, sickLeave: 7, earnedLeave: 5 },
    })),
  });
  console.log(`  leavebalances: ${allUsers.length} recreated`);

  // ── Salary Structures (3 months) ───────────────────────────────────────────
  await bp.salaryStructure.deleteMany({});
  const salaryDocs: any[] = [];
  for (const user of allUsers) {
    for (const { month, year } of [
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
      { month: 4, year: 2026 },
    ]) {
      const grossEarnings =
        user.salaryBasicPay + user.salaryHra + user.salaryConveyance;
      const deductions = user.salaryPf + user.salaryEsi + user.salaryPt;
      salaryDocs.push({
        tenantId: BONAMI_TENANT_ID,
        userId: user.id,
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
  await bp.salaryStructure.createMany({ data: salaryDocs });
  console.log(`  salarystructures: ${salaryDocs.length} recreated`);

  // ── Notifications + Recipients ─────────────────────────────────────────────
  await bp.notificationRecipient.deleteMany({});
  await bp.notification.deleteMany({});
  const notifications = await Promise.all([
    bp.notification.create({
      data: {
        tenantId: BONAMI_TENANT_ID,
        title: "Welcome to Bonami Software HRMS",
        message:
          "Your HRMS portal is now live. Explore attendance, leave management, and more.",
        timeStamp: daysAgo(85),
        eventType: "general",
        priority: "high",
      },
    }),
    bp.notification.create({
      data: {
        tenantId: BONAMI_TENANT_ID,
        title: "Annual Appraisal Cycle Starting",
        message:
          "The annual appraisal cycle begins in 2 weeks. Please complete your self-assessment by the deadline.",
        timeStamp: daysAgo(5),
        eventType: "hr",
        priority: "medium",
      },
    }),
    bp.notification.create({
      data: {
        tenantId: BONAMI_TENANT_ID,
        title: "Holiday: Independence Day",
        message:
          "The office will be closed on August 15th for Independence Day.",
        timeStamp: daysAgo(10),
        eventType: "holiday",
        priority: "low",
      },
    }),
  ]);
  const recipientDocs: any[] = [];
  for (const notif of notifications) {
    for (const user of allUsers) {
      recipientDocs.push({
        tenantId: BONAMI_TENANT_ID,
        notificationId: notif.id,
        userId: user.id,
        isCleared: Math.random() < 0.5,
      });
    }
  }
  await bp.notificationRecipient.createMany({ data: recipientDocs });
  console.log(
    `  notifications: ${notifications.length} recreated, recipients: ${recipientDocs.length}`,
  );

  // ── Job Openings + Applications ────────────────────────────────────────────
  await bp.jobApplication.deleteMany({});
  await bp.jobOpening.deleteMany({});
  const fsOpening = await bp.jobOpening.create({
    data: {
      tenantId: BONAMI_TENANT_ID,
      jobTitle: "Full Stack Developer",
      numberOfVacancies: 2,
      jobPostingDate: daysAgo(30),
      applicationDeadline: daysFromNow(14),
      jobDescription:
        "Looking for an experienced Full Stack Developer proficient in React and Node.js to join our Engineering team.",
      requiredSkills: "React, Node.js, MongoDB, TypeScript, REST APIs",
      experience: 3,
      budget: [800000, 1200000],
      department: "Engineering",
      hiringManager: "Sameer Yadav",
      candidatesHired: 0,
      status: "Active",
      createdBy: OWNER_USER_ID,
      createdOn: daysAgo(30),
    },
  });
  await bp.jobOpening.create({
    data: {
      tenantId: BONAMI_TENANT_ID,
      jobTitle: "Sales Manager",
      numberOfVacancies: 1,
      jobPostingDate: daysAgo(15),
      applicationDeadline: daysFromNow(21),
      jobDescription:
        "Seeking a driven Sales Manager to lead and expand our sales team. B2B SaaS experience preferred.",
      requiredSkills: "B2B Sales, CRM tools, Team Leadership, Communication",
      experience: 5,
      budget: [1000000, 1500000],
      department: "Sales",
      hiringManager: "Sameer Yadav",
      candidatesHired: 0,
      status: "Active",
      createdBy: OWNER_USER_ID,
      createdOn: daysAgo(15),
    },
  });
  await bp.jobApplication.createMany({
    data: [
      {
        tenantId: BONAMI_TENANT_ID,
        jobTitleId: fsOpening.id,
        name: "Ankit Bhatt",
        mobile: "9988776655",
        email: "ankit.bhatt@example.com",
        status: "Interview Scheduled",
        resumeScore: 82,
        aiNotes: "Strong React skills, 4 years experience. Good cultural fit.",
        interviews: [
          {
            round: 1,
            scheduledAt: daysFromNow(2).toISOString(),
            status: "Scheduled",
          },
        ],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        jobTitleId: fsOpening.id,
        name: "Sneha Pillai",
        mobile: "9977665544",
        email: "sneha.pillai@example.com",
        status: "Applied",
        resumeScore: 74,
        aiNotes: "Solid Node.js background, limited TypeScript experience.",
        interviews: [],
      },
      {
        tenantId: BONAMI_TENANT_ID,
        jobTitleId: fsOpening.id,
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
  console.log("  jobopenings: 2 recreated, jobapplications: 3 recreated");

  // ── Chatrooms + Messages ───────────────────────────────────────────────────
  await bp.message.deleteMany({});
  await bp.chatRoom.deleteMany({});
  const generalRoom = await bp.chatRoom.create({
    data: {
      tenantId: BONAMI_TENANT_ID,
      type: "group",
      name: "General",
      participants: allUsers.map((u) => u.id),
      deletedFor: [],
      lastActivity: daysAgo(1),
      createdAt: daysAgo(85),
    },
  });
  const messages = [
    { content: "Welcome everyone to Bonami Software HRMS! 🎉", daysAgo: 85 },
    {
      content:
        "Hi team! Please complete your attendance regularization for last month.",
      daysAgo: 30,
    },
    {
      content:
        "Sure, will do. Also, when are the salary slips for April being uploaded?",
      daysAgo: 29,
    },
    {
      content:
        "April salary slips will be available by May 5th. Please check the portal.",
      daysAgo: 29,
    },
    {
      content:
        "Team building workshop this Friday at 2 PM. Please block your calendars!",
      daysAgo: 3,
    },
  ];
  const senderIds = [
    OWNER_USER_ID,
    hrUserId,
    nonOwnerIds[0] ?? OWNER_USER_ID,
    hrUserId,
    OWNER_USER_ID,
  ];
  let lastMsgId: string | null = null;
  for (let i = 0; i < messages.length; i++) {
    const msg = await bp.message.create({
      data: {
        tenantId: BONAMI_TENANT_ID,
        chatRoomId: generalRoom.id,
        senderId: senderIds[i],
        content: messages[i].content,
        type: "text",
        readBy: allUsers.slice(0, 4).map((u) => u.id),
        isDeleted: false,
        createdAt: daysAgo(messages[i].daysAgo),
      },
    });
    lastMsgId = msg.id;
  }
  if (lastMsgId) {
    await bp.chatRoom.update({
      where: { id: generalRoom.id },
      data: { lastMessageId: lastMsgId },
    });
  }
  console.log(
    `  chatrooms: 1 recreated, messages: ${messages.length} recreated`,
  );

  // ── Audit Logs ────────────────────────────────────────────────────────────
  await bp.auditLog.deleteMany({});
  const auditDocs: any[] = [];
  const auditActions = [
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
    {
      action: "VIEW_SALARY_SLIP",
      entityType: "Salary",
      description: "User viewed salary slip",
    },
    {
      action: "UPDATE_KYC",
      entityType: "User",
      description: "KYC information updated",
    },
    {
      action: "VIEW_POLICY",
      entityType: "Policy",
      description: "User viewed company policy",
    },
  ];
  for (const user of allUsers) {
    for (let i = 0; i < 8; i++) {
      const a = auditActions[i];
      auditDocs.push({
        tenantId: BONAMI_TENANT_ID,
        userId: user.id,
        action: a.action,
        entityType: a.entityType,
        description: a.description,
        ipAddress: `192.168.1.${10 + Math.floor(Math.random() * 50)}`,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        timestamp: daysAgo(Math.floor(Math.random() * 60) + 1),
      });
    }
  }
  await bp.auditLog.createMany({ data: auditDocs });
  console.log(`  auditlogs: ${auditDocs.length} recreated`);

  // ── Resignations ───────────────────────────────────────────────────────────
  await bp.resignation.deleteMany({});
  await bp.resignation.create({
    data: {
      tenantId: BONAMI_TENANT_ID,
      userId: nonOwnerIds[3] ?? nonOwnerIds[0] ?? OWNER_USER_ID, // rahul_verma
      resignationDate: daysAgo(45),
      lastWorkingDay: daysAgo(15),
      reason: "Better opportunity",
      comments: "Received an offer with a higher compensation package.",
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
  });
  console.log("  resignations: 1 recreated");

  console.log(
    "\n✓ Bonami Software reseed complete. All dates are now proper BSON Dates.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
    await bp.$disconnect();
  });
