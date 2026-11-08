/** Read-only payroll reconciliation against a real MongoDB (synthetic data). */
import { getClientForDb } from "@hrms/db";
import {
  reconcileTenant,
  createAnonymiser,
} from "../packages/database/src/reconcile-disbursed-payroll";

const client = getClientForDb("hrms-it-beta") as any;
const TENANT = "78000000000000000000f001";
const RUN = "78000000000000000000f002";
const A = "78000000000000000000a001";
const B = "78000000000000000000a002";
const C = "78000000000000000000a003";
const d = (day: number) => new Date(Date.UTC(2026, 8, day));
const weekdays = Array.from({ length: 30 }, (_, i) => i + 1).filter(
  (x) => ![0, 6].includes(d(x).getUTCDay()),
);
const COLLECTIONS = [
  "payroll_runs",
  "payroll_line_items",
  "attendance_records",
  "leaves",
  "leavebalances",
  "resignations",
];

async function clear() {
  for (const c of COLLECTIONS) {
    await client.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
}

async function attend(userId: string, skip: number[]) {
  await client.attendanceRecord.createMany({
    data: weekdays
      .filter((x) => !skip.includes(x))
      .map((x) => ({
        tenantId: TENANT,
        userId,
        date: d(x),
        status: "Present",
      })),
  });
}

beforeAll(async () => {
  await clear();
  await client.payrollRun.create({
    data: {
      id: RUN,
      tenantId: TENANT,
      month: 9,
      year: 2026,
      status: "disbursed",
      initiatedBy: "78000000000000000000b001",
    },
  });
  for (const [userId, gross] of [
    [A, 28000],
    [B, 30000],
    [C, 27000],
  ] as Array<[string, number]>) {
    await client.payrollLineItem.create({
      data: {
        tenantId: TENANT,
        payrollRunId: RUN,
        userId,
        grossSalary: gross,
        basicPay: 0,
        hra: 0,
        conveyance: 0,
        pf: 0,
        esi: 0,
        pt: 0,
        totalDeductions: 0,
        netPayable: gross,
      },
    });
  }
  await attend(A, [8, 9]);
  await attend(B, []);
  await attend(C, [8, 9, 10]);
  const leave = (userId: string, leaveType: string, status: string) => ({
    tenantId: TENANT,
    userId,
    leaveType,
    status,
    days: 2,
    from: d(8),
    to: d(9),
  });
  await client.leaveApplication.createMany({
    data: [
      leave(A, "CL", "Approved"),
      leave(C, "LWP", "Approved"),
      leave(B, "CL", "Rejected"),
    ],
  });
});

afterAll(clear);

const snapshot = async () =>
  Promise.all(
    [
      client.payrollRun,
      client.payrollLineItem,
      client.attendanceRecord,
      client.leaveApplication,
    ].map((m: any) => m.findMany({ orderBy: { id: "asc" } })),
  );

it("estimates only approved paid leave", async () => {
  const { summary, rows } = await reconcileTenant(
    client,
    "Tenant-1",
    new Map(),
    createAnonymiser(),
  );
  expect(summary.runs).toEqual([
    {
      period: "2026-09",
      employees: 3,
      employeesWithApprovedPaidLeave: 1,
      employeesAffected: 1,
      paidDaysDifference: 2,
    },
  ]);
  expect(summary.employeesAffected).toBe(1);
  expect(rows).toHaveLength(1);
  expect(rows[0].paidDaysAsRun).toBe(28);
  expect(rows[0].paidDaysCorrected).toBe(30);
  expect(rows[0].estimatedGrossUnderpayment).toBe(2000);
});

it("anonymises employees", async () => {
  const { rows, summary } = await reconcileTenant(
    client,
    "Tenant-1",
    new Map(),
    createAnonymiser(),
  );
  const text = JSON.stringify({ rows, summary });
  expect(text).not.toContain(A);
  expect(rows[0].employee).toMatch(/^emp_[a-f0-9]{10}$/);
});

it("changes nothing", async () => {
  const before = await snapshot();
  await reconcileTenant(client, "Tenant-1", new Map(), createAnonymiser());
  expect(await snapshot()).toEqual(before);
});
