/**
 * Actual seeding logic for `db:seed` (packages/database/src/seed.ts).
 *
 * Split out from seed.ts so that seed.ts can call loadSecrets() *before*
 * this module (and therefore @hrms/db's PrismaClient) is ever imported —
 * mirrors every service's bootstrap.ts pattern of `await loadSecrets(...)`
 * followed by `await import("./server")`.
 */
import { faker } from "@faker-js/faker";
import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "./index";
import { logger } from "@hrms/logger";

const SEEDED_EMPLOYEE_THRESHOLD = 5;

const DEPARTMENTS = ["Engineering", "Human Resources", "Sales", "Finance"];
const DESIGNATIONS_BY_DEPT: Record<string, string[]> = {
  Engineering: ["Software Engineer", "Senior Engineer", "Engineering Manager"],
  "Human Resources": ["HR Executive", "HR Manager"],
  Sales: ["Sales Executive", "Sales Manager"],
  Finance: ["Accountant", "Finance Manager"],
};
const EMPLOYEE_COUNT = 10;

interface SeededEmployee {
  id: string;
  username: string;
  department: string;
  designation: string;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Managerial designations earn more than individual-contributor ones —
// keeps seeded payroll numbers from looking flat across a tenant.
const MANAGER_DESIGNATIONS = new Set([
  "Engineering Manager",
  "HR Manager",
  "Sales Manager",
  "Finance Manager",
]);

function randomSalaryFor(designation: string): number {
  return MANAGER_DESIGNATIONS.has(designation)
    ? faker.number.int({ min: 90000, max: 180000 })
    : faker.number.int({ min: 30000, max: 80000 });
}

// ─── Org structure ──────────────────────────────────────────────────────────

async function seedOrgStructure(
  tenantId: string,
  createdBy: string,
): Promise<{ branchId: string; shiftId: string }> {
  const branch = await (prismaWithTenant as any).branch.create({
    data: {
      tenantId,
      name: `${faker.location.city()} HQ`,
      address: faker.location.streetAddress(),
      isHeadOffice: true,
      createdBy,
    },
  });

  const shift = await (prismaWithTenant as any).shift.create({
    data: {
      tenantId,
      name: "General Shift",
      startHour: 9,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
      isDefault: true,
      createdBy,
    },
  });

  for (const name of DEPARTMENTS) {
    await (prismaWithTenant as any).department.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name, createdBy },
    });
  }
  for (const [dept, names] of Object.entries(DESIGNATIONS_BY_DEPT)) {
    for (const name of names) {
      await (prismaWithTenant as any).designation.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: {},
        create: { tenantId, name, createdBy },
      });
    }
  }

  return { branchId: branch.id, shiftId: shift.id };
}

// ─── Employees (+ KYC fields, which live directly on User) ────────────────

async function seedEmployees(
  tenantId: string,
  branchId: string,
  shiftId: string,
): Promise<SeededEmployee[]> {
  const employees: SeededEmployee[] = [];

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const department = randomItem(DEPARTMENTS);
    const designation = randomItem(DESIGNATIONS_BY_DEPT[department]);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const username = faker.internet
      .username({ firstName, lastName })
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");

    const user = await (prismaWithTenant as any).user.create({
      data: {
        username: `${username}-${faker.string.alphanumeric(4)}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        mobile: faker.phone
          .number({ style: "national" })
          .replace(/\D/g, "")
          .slice(0, 10),
        department,
        designation,
        branchId,
        shiftId,
        employeeStatus: "Active",
        employmentType: "employee",
        role: ["employee"],
        joining_date: faker.date.past({ years: 3 }),
        // KYC — no separate model, these are plain User fields.
        aadhar_no: faker.string.numeric(12),
        pan_no: faker.string.alphanumeric(10).toUpperCase(),
        bank_account_no: faker.finance.accountNumber(),
        bank_name: faker.company.name() + " Bank",
        ifsc_code: `HDFC0${faker.string.numeric(6)}`,
        kyc_date: faker.date.past({ years: 1 }),
        kyc_approval: randomItem([
          "Approved",
          "Approved",
          "Approved",
          "Pending",
        ]),
        salary: randomSalaryFor(designation),
      },
      // Only the id is needed downstream; tenantId is auto-injected by
      // prismaWithTenant's masterScopedPrisma wrapper (User is a master model).
      select: { id: true, username: true, department: true, designation: true },
    });

    await (prisma as any).tenantMembership.create({
      data: { tenantId, userId: user.id, role: "employee" },
    });

    employees.push(user);
  }

  return employees;
}

// ─── Job openings + applications ────────────────────────────────────────────

async function seedJobOpenings(
  tenantId: string,
  createdBy: string,
): Promise<void> {
  const openingCount = faker.number.int({ min: 3, max: 5 });
  for (let i = 0; i < openingCount; i++) {
    const department = randomItem(DEPARTMENTS);
    const opening = await (prismaWithTenant as any).jobOpening.create({
      data: {
        tenantId,
        jobTitle: `${randomItem(DESIGNATIONS_BY_DEPT[department])} - ${faker.string.alphanumeric(4)}`,
        numberOfVacancies: faker.number.int({ min: 1, max: 4 }),
        applicationDeadline: faker.date.future({ years: 0.25 }),
        jobDescription: faker.lorem.paragraph(),
        requiredSkills: faker.lorem.words(5),
        experience: faker.number.int({ min: 0, max: 8 }),
        budget: [
          faker.number.int({ min: 30000, max: 60000 }),
          faker.number.int({ min: 60000, max: 120000 }),
        ],
        department,
        hiringManager: createdBy,
        status: randomItem(["Open", "Open", "Active", "Closed"]),
        createdBy,
      },
    });

    const applicationCount = faker.number.int({ min: 2, max: 6 });
    for (let j = 0; j < applicationCount; j++) {
      await (prismaWithTenant as any).jobApplication.create({
        data: {
          tenantId,
          jobTitleId: opening.id,
          name: faker.person.fullName(),
          email: faker.internet.email().toLowerCase(),
          mobile: faker.string.numeric(10),
          status: randomItem(["Applied", "Applied", "Shortlisted", "Rejected"]),
        },
      });
    }
  }
}

// ─── Assets ─────────────────────────────────────────────────────────────────

async function seedAssets(
  tenantId: string,
  createdBy: string,
  employees: SeededEmployee[],
): Promise<void> {
  const categories = ["Laptop", "Phone", "Monitor", "Furniture"];
  const assetCount = faker.number.int({ min: 5, max: 10 });

  for (let i = 0; i < assetCount; i++) {
    const category = randomItem(categories);
    const asset = await (prismaWithTenant as any).asset.create({
      data: {
        tenantId,
        assetCode: `${category.slice(0, 3).toUpperCase()}-${faker.string.numeric(4)}`,
        name: `${faker.company.buzzAdjective()} ${category}`,
        category,
        brand: faker.company.name(),
        purchaseDate: faker.date.past({ years: 2 }),
        purchaseValue: faker.number.int({ min: 5000, max: 150000 }),
        status: "assigned",
        condition: "good",
        createdBy,
      },
    });

    const holder = randomItem(employees);
    await (prismaWithTenant as any).assetAssignment.create({
      data: {
        tenantId,
        assetId: asset.id,
        userId: holder.id,
        assignedBy: createdBy,
        acknowledgedAt: faker.date.recent({ days: 30 }),
      },
    });
  }
}

// ─── Attendance + leave + salary (month-aligned, additive/idempotent) ──────
//
// initiatePayrollRun (apps/api-gateway/src/handlers/payroll.ts) can only run
// for *past* calendar months, and prorates pay by
// (present+late+halfDay*0.5+holiday+wfh+paidLeaves) / daysInMonth — computed
// from AttendanceRecord + LeaveBalance.balances[].usedPL for that exact
// month. generateSalarySlip needs a SalaryStructure row for the exact
// (userId, month, year) requested (no fallback to "latest"). So to actually
// exercise those flows, seeded data must cover full calendar months, not a
// rolling window — and must not itself insert a PayrollRun, or it would
// collide with the tenant+month+year unique constraint and block the real
// "Initiate Payroll Run" button for that month.
//
// This section is additive and safe to call on employees that were already
// seeded by a previous run: it only fills in months missing from each
// employee's LeaveBalance.balances / SalaryStructure, never deletes or
// overwrites existing data (which could include real payroll runs the user
// already triggered by hand).

/** The last two full calendar months plus the current (partial) one. */
function targetPayrollMonths(): { month: number; year: number }[] {
  const now = new Date();
  return [2, 1, 0].map((monthsBack) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });
}

/** Weekdays in a given month, capped at `through` (inclusive) if provided. */
function weekdaysInMonth(year: number, month: number, through?: Date): Date[] {
  const dates: Date[] = [];
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const lastDay =
    through &&
    through.getFullYear() === year &&
    through.getMonth() + 1 === month
      ? Math.min(through.getDate(), lastDayOfMonth)
      : lastDayOfMonth;
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push(d);
  }
  return dates;
}

async function seedAttendanceAndLeaveForEmployee(
  tenantId: string,
  employee: SeededEmployee,
  months: { month: number; year: number }[],
  now: Date,
): Promise<void> {
  const leaveBalance = await (prismaWithTenant as any).leaveBalance.findFirst({
    where: { tenantId, userId: employee.id },
  });
  // balances is a bare Json? field (no array-of-Json schema constraint) —
  // rows from older, non-seed-script sources (e.g. hand-rolled tenant seeds)
  // may not have it shaped as an array. Same hazard apps/api-gateway's real
  // payroll/salary-slip handlers guard against.
  const existingBalances: any[] = Array.isArray(leaveBalance?.balances)
    ? leaveBalance.balances
    : [];
  const existingMonths = new Set(
    existingBalances.map((b: any) => `${b.year}-${b.month}`),
  );

  const newBalanceEntries: any[] = [];
  for (const { month, year } of months) {
    if (existingMonths.has(`${year}-${month}`)) continue; // already backfilled

    const isCurrentMonth =
      year === now.getFullYear() && month === now.getMonth() + 1;
    // For the current (in-progress) month, only seed through yesterday.
    const through = isCurrentMonth
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      : undefined;
    const dates = weekdaysInMonth(year, month, through);

    let usedPL = 0;
    for (const date of dates) {
      const roll = Math.random();
      if (roll < 0.1) {
        // On leave — an approved LeaveApplication instead of an attendance row.
        // PL is the only leave type that counts toward payroll's paidLeaves.
        const leaveType = randomItem(["PL", "PL", "PL", "SL", "CL"]);
        if (leaveType === "PL") usedPL++;
        await (prismaWithTenant as any).leaveApplication.create({
          data: {
            tenantId,
            userId: employee.id,
            from: date,
            to: date,
            leaveType,
            days: 1,
            status: "Approved",
            unit: "full_day",
            appliedOn: date,
            approvedOn: date,
          },
        });
        continue;
      }

      const late = roll > 0.92;
      const wfh = !late && roll > 0.88;
      const timeIn = new Date(date);
      timeIn.setHours(
        late ? 10 : 9,
        faker.number.int({ min: 0, max: 45 }),
        0,
        0,
      );
      const timeOut = new Date(date);
      timeOut.setHours(18, faker.number.int({ min: 0, max: 45 }), 0, 0);

      await (prismaWithTenant as any).attendanceRecord.create({
        data: {
          tenantId,
          userId: employee.id,
          date,
          timeIn,
          timeOut,
          workingHours: 8,
          status: wfh ? "WFH" : late ? "Late" : "Present",
        },
      });
    }

    newBalanceEntries.push({
      month,
      year,
      earnedPL: 1,
      usedPL,
      usedLWP: 0,
      remainingPL: Math.max(0, 1 - usedPL),
    });
  }

  if (newBalanceEntries.length === 0) return;

  if (leaveBalance) {
    await (prismaWithTenant as any).leaveBalance.update({
      where: { id: leaveBalance.id },
      data: { balances: [...existingBalances, ...newBalanceEntries] },
    });
  } else {
    await (prismaWithTenant as any).leaveBalance.create({
      data: {
        tenantId,
        userId: employee.id,
        accumulatedPLBeforeCurrentMonth: faker.number.int({ min: 0, max: 8 }),
        balances: newBalanceEntries,
      },
    });
  }
}

async function seedSalaryForEmployee(
  tenantId: string,
  employee: SeededEmployee,
  months: { month: number; year: number }[],
): Promise<void> {
  const user = await (prismaWithTenant as any).user.findUnique({
    where: { id: employee.id },
    select: { salary: true, salaryBasicPay: true },
  });
  const salary = user?.salary ?? randomSalaryFor(employee.designation);

  // Standard Indian-payroll-style split: 50% basic, 25% HRA, remainder
  // conveyance (so basic+hra+conveyance reconciles exactly to gross salary).
  const basicPay = Math.round(salary * 0.5);
  const hra = Math.round(salary * 0.25);
  const conveyance = salary - basicPay - hra;
  const pf = Math.round(basicPay * 0.12);
  const esi = 0;
  const pt = 200;
  const grossEarnings = basicPay + hra + conveyance;
  const netPayable = grossEarnings - pf - pt;

  // initiatePayrollRun reads these directly off User (not SalaryStructure)
  // when building a real run's Basic/HRA/Conveyance breakdown.
  if (user?.salaryBasicPay == null) {
    await (prismaWithTenant as any).user.update({
      where: { id: employee.id },
      data: {
        salaryBasicPay: basicPay,
        salaryHra: hra,
        salaryConveyance: conveyance,
        salaryPf: pf,
        salaryEsi: esi,
        salaryPt: pt,
      },
    });
  }

  for (const { month, year } of months) {
    const existing = await (prismaWithTenant as any).salaryStructure.findFirst({
      where: { tenantId, userId: employee.id, month, year },
      select: { id: true },
    });
    if (existing) continue;

    await (prismaWithTenant as any).salaryStructure.create({
      data: {
        tenantId,
        userId: employee.id,
        grossSalary: grossEarnings,
        month,
        year,
        basicPay,
        hra,
        conveyance,
        pf,
        esi,
        pt,
        grossEarnings,
        netPayable,
      },
    });
  }
}

// ─── HR activities ──────────────────────────────────────────────────────────

async function seedHrActivities(
  tenantId: string,
  createdBy: string,
): Promise<void> {
  const titles = [
    "Town Hall Meeting",
    "Performance Review Cycle",
    "Team Building Event",
    "Benefits Enrollment",
    "Policy Training",
  ];
  const count = faker.number.int({ min: 4, max: 6 });
  for (let i = 0; i < count; i++) {
    await (prismaWithTenant as any).hrActivity.create({
      data: {
        tenantId,
        title: randomItem(titles),
        description: faker.lorem.sentence(),
        scheduledAt: faker.date.recent({ days: 60 }),
        status: randomItem(["Scheduled", "Completed"]),
        createdBy,
      },
    });
  }
}

// ─── Per-tenant orchestration ───────────────────────────────────────────────

async function seedTenant(tenant: {
  id: string;
  dbName: string | null;
}): Promise<void> {
  if (!tenant.dbName) {
    logger.info(
      `db:seed: tenant ${tenant.id} has no dedicated DB yet — skipping`,
    );
    return;
  }

  const tenantClient = getClientForDb(tenant.dbName);
  await runWithTenant(tenant.id, tenantClient, async () => {
    let employees: SeededEmployee[] = await (
      prismaWithTenant as any
    ).user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, username: true, department: true, designation: true },
    });

    if (employees.length < SEEDED_EMPLOYEE_THRESHOLD) {
      // Branch/Shift/Department/Designation.createdBy are @db.ObjectId — no
      // "system user" exists yet at this point (employees are created next),
      // so use the tenant's own id, which is already a valid ObjectId.
      const { branchId, shiftId } = await seedOrgStructure(
        tenant.id,
        tenant.id,
      );
      employees = await seedEmployees(tenant.id, branchId, shiftId);

      await seedJobOpenings(tenant.id, employees[0].username);
      await seedAssets(tenant.id, employees[0].id, employees);
      await seedHrActivities(tenant.id, employees[0].username);

      logger.info(
        `db:seed: seeded org structure + ${employees.length} employees for tenant ${tenant.id}`,
      );
    } else {
      logger.info(
        `db:seed: tenant ${tenant.id} already has ${employees.length} employees — backfilling attendance/leave/salary only`,
      );
    }

    // Always runs — additive/idempotent per employee per month, so it both
    // seeds fresh tenants and tops up already-seeded ones with whichever of
    // the last-2-months + current-month is still missing.
    const months = targetPayrollMonths();
    const now = new Date();
    for (const employee of employees) {
      await seedAttendanceAndLeaveForEmployee(tenant.id, employee, months, now);
      await seedSalaryForEmployee(tenant.id, employee, months);
    }

    logger.info(
      `db:seed: attendance/leave/salary up to date for tenant ${tenant.id} (${employees.length} employees)`,
    );
  });
}

/** Seeds every active tenant. Returns the number of tenants that errored. */
export async function runSeed(): Promise<number> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, dbName: true },
  });

  logger.info(`db:seed: seeding ${tenants.length} active tenant(s)`);

  let errors = 0;
  for (const tenant of tenants) {
    try {
      await seedTenant(tenant);
    } catch (err) {
      errors++;
      logger.error(`db:seed: error seeding tenant ${tenant.id}`, { err });
    }
  }

  logger.info(`db:seed: done (${errors} tenant errors)`);
  return errors;
}
