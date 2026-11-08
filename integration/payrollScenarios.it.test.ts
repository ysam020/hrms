/**
 * Payroll integrity CHARACTERIZATION against real code and a real
 * MongoDB replica set (isolated container). Synthetic people only, uniform
 * ₹30,000 test salary, September 2026 (30 days, 22 Mon–Fri working days,
 * 8 weekend days, no holidays configured → default Mon–Fri week).
 *
 * Runs the REAL gateway payroll handler (initiatePayrollRun) and the REAL
 * salary-service payslip handler (getPayslip). It asserts what the code
 * does TODAY — it does not assert a payroll policy; the "if paid leave were
 * paid" column is printed for the pending paid-leave product decision, not enforced.
 */
// The gateway PDF payslip asks salary-service for the employee and salary
// structure over gRPC; route that call to the REAL salary-service handler
// in-process (same request shape), everything else unchanged.
jest.mock("../apps/api-gateway/src/grpc/clients", () => {
  const actual = jest.requireActual("../apps/api-gateway/src/grpc/clients");
  return {
    ...actual,
    grpcCall: (_client: unknown, method: string, req: any) => {
      if (method !== "getPayslip") throw new Error(`unexpected gRPC ${method}`);
      const { getPayslip: real } = jest.requireActual(
        "../apps/salary-service/src/handlers/getPayslip",
      );
      return new Promise((resolve) =>
        real({ request: req }, (_e: unknown, r: any) => resolve(r)),
      );
    },
  };
});

import express from "express";
import {
  buildSalarySlipPdf,
  derivePdfPassword,
} from "../apps/api-gateway/src/handlers/salary";

// pdf-parse's bundled pdf.js — opens the password-protected payslip.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFJS = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
async function pdfText(buffer: Buffer, password: string): Promise<string> {
  const doc = await PDFJS.getDocument({
    data: new Uint8Array(buffer),
    password,
  });
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join("\n") + "\n";
  }
  return text;
}
// Synthetic identity used only to password-protect the test PDFs.
const PAN = "ABCDE1234F";
const DOB = new Date(Date.UTC(1990, 0, 1));
import http from "node:http";
import { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { writeFileSync } from "node:fs";
import { prisma, getClientForDb, runWithTenant } from "@hrms/db";
import { authenticate } from "../apps/api-gateway/src/middleware/authenticate";
import { withUserAccessScope } from "../apps/api-gateway/src/services/userAccess";
import { clearAccountAccessCache } from "../apps/api-gateway/src/services/accountAccess";
import { initiatePayrollRun } from "../apps/api-gateway/src/handlers/payroll";
import { getPayslip } from "../apps/salary-service/src/handlers/getPayslip";

const TENANT = "7a0000000000000000000001";
const DB = "hrms-it-payroll";
const HR = "7b0000000000000000000000";
const YEAR = 2026;
const MONTH = 9;
const DAYS = 30;
const GROSS = 30000;
const oid = (id: string) => ({ $oid: id });
const d = (day: number, month = MONTH) =>
  new Date(Date.UTC(YEAR, month - 1, day));

const workingDays = (from = 1, to = DAYS) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((day) => {
    const dow = d(day).getUTCDay();
    return dow >= 1 && dow <= 5;
  });

interface Scenario {
  key: string;
  label: string;
  present: number[]; // working days with a Present record
  halfDays?: number[];
  leaves?: Array<{
    type: string;
    from: Date;
    to: Date;
    days: number;
    status: string;
    unit?: string;
  }>;
  ledgerUsedPL?: number; // legacy array ledger entry for the month
  flatBalances?: Record<string, number>; // policy-style balances
  joining?: Date;
  lastWorkingDay?: Date;
  /** Salary as a component breakdown (the path production tenants use). */
  breakdown?: boolean;
  /** Days that would be paid if approved paid leave counted as paid days. */
  paidIfLeavePaid: number;
}

const all = workingDays();
const except = (...skip: number[]) => all.filter((x) => !skip.includes(x));
const SCENARIOS: Scenario[] = [
  {
    key: "S01",
    label: "No leave, full attendance",
    present: all,
    paidIfLeavePaid: 30,
  },
  {
    key: "S02",
    label: "Approved CL, 2 days (Sep 8–9)",
    present: except(8, 9),
    leaves: [{ type: "CL", from: d(8), to: d(9), days: 2, status: "Approved" }],
    flatBalances: { CL: 10 },
    paidIfLeavePaid: 30,
  },
  {
    key: "S03",
    label: "Approved SL, 1 day (Sep 10)",
    present: except(10),
    leaves: [
      { type: "SL", from: d(10), to: d(10), days: 1, status: "Approved" },
    ],
    flatBalances: { SL: 7 },
    paidIfLeavePaid: 30,
  },
  {
    key: "S04",
    label: "Approved EL, 3 days (Sep 14–16)",
    present: except(14, 15, 16),
    leaves: [
      { type: "EL", from: d(14), to: d(16), days: 3, status: "Approved" },
    ],
    flatBalances: { EL: 12 },
    paidIfLeavePaid: 30,
  },
  {
    key: "S05",
    label: "Pending leave, 2 days (not approved)",
    present: except(8, 9),
    leaves: [{ type: "CL", from: d(8), to: d(9), days: 2, status: "Pending" }],
    paidIfLeavePaid: 28,
  },
  {
    key: "S06",
    label: "Rejected leave, 2 days",
    present: except(8, 9),
    leaves: [{ type: "CL", from: d(8), to: d(9), days: 2, status: "Rejected" }],
    paidIfLeavePaid: 28,
  },
  {
    key: "S07",
    label: "Approved half-day CL + Half Day attendance (Sep 8)",
    present: except(8),
    halfDays: [8],
    leaves: [
      {
        type: "CL",
        from: d(8),
        to: d(8),
        days: 0.5,
        status: "Approved",
        unit: "half_day",
      },
    ],
    paidIfLeavePaid: 30,
  },
  {
    key: "S08",
    label: "Approved CL 5 days, balance only 2 (Sep 21–25)",
    present: except(21, 22, 23, 24, 25),
    leaves: [
      { type: "CL", from: d(21), to: d(25), days: 5, status: "Approved" },
    ],
    flatBalances: { CL: 2 },
    paidIfLeavePaid: 27 /* if shortfall is LOP */,
  },
  {
    key: "S09",
    label: "Approved unpaid leave (LWP), 2 days",
    present: except(8, 9),
    leaves: [
      { type: "LWP", from: d(8), to: d(9), days: 2, status: "Approved" },
    ],
    paidIfLeavePaid: 28,
  },
  {
    key: "S10",
    label: "Mixed: CL 2 days + LWP 1 day",
    present: except(8, 9, 10),
    leaves: [
      { type: "CL", from: d(8), to: d(9), days: 2, status: "Approved" },
      { type: "LWP", from: d(10), to: d(10), days: 1, status: "Approved" },
    ],
    flatBalances: { CL: 10 },
    paidIfLeavePaid: 29,
  },
  {
    key: "S11",
    label: "Attendance gaps: 3 working days, no record, no leave",
    present: except(8, 9, 10),
    paidIfLeavePaid: 27,
  },
  {
    key: "S12",
    label: "EL spanning Aug 31–Sep 2 (2 days in September)",
    present: except(1, 2),
    leaves: [
      { type: "EL", from: d(31, 8), to: d(2), days: 3, status: "Approved" },
    ],
    flatBalances: { EL: 12 },
    paidIfLeavePaid: 30,
  },
  {
    key: "S13",
    label: "Joins Sep 16 (present every working day after)",
    present: workingDays(16),
    joining: d(16),
    paidIfLeavePaid: 15,
  },
  {
    key: "S14",
    label: "Leaves (last working day) Sep 15",
    present: workingDays(1, 15),
    lastWorkingDay: d(15),
    paidIfLeavePaid: 15,
  },
  {
    key: "S15",
    label: "Approved CL on Sep 8 AND a Present record that day",
    present: all,
    leaves: [{ type: "CL", from: d(8), to: d(8), days: 1, status: "Approved" }],
    paidIfLeavePaid: 30,
  },
  {
    key: "S16",
    label: "Legacy ledger usedPL=2 for Sep, 2 days with no record",
    present: except(8, 9),
    ledgerUsedPL: 2,
    paidIfLeavePaid: 30,
  },
  // Same situations on the COMPONENT-BREAKDOWN salary path.
  {
    key: "B01",
    label: "[breakdown] No leave, full attendance",
    present: all,
    breakdown: true,
    paidIfLeavePaid: 30,
  },
  {
    key: "B02",
    label: "[breakdown] Approved CL, 2 days",
    present: except(8, 9),
    leaves: [{ type: "CL", from: d(8), to: d(9), days: 2, status: "Approved" }],
    flatBalances: { CL: 10 },
    breakdown: true,
    paidIfLeavePaid: 30,
  },
  {
    key: "B13",
    label: "[breakdown] Joins Sep 16",
    present: workingDays(16),
    joining: d(16),
    breakdown: true,
    paidIfLeavePaid: 15,
  },
  {
    key: "B14",
    label: "[breakdown] Last working day Sep 15",
    present: workingDays(1, 15),
    lastWorkingDay: d(15),
    breakdown: true,
    paidIfLeavePaid: 15,
  },
];

// Today's payroll-run paid days per scenario (measured 2026-11-07).
const EXPECTED_RUN_PAID_DAYS: Record<string, number> = {
  S01: 30,
  S02: 28,
  S03: 29,
  S04: 27,
  S05: 28,
  S06: 28,
  S07: 29.5,
  S08: 25,
  S09: 28,
  S10: 27,
  S11: 27,
  S12: 28,
  S13: 15,
  S14: 15,
  S15: 30,
  S16: 30,
  B01: 30,
  B02: 28,
  B13: 15,
  B14: 15,
};
const PAY02_KEYS = new Set(["S13", "S14", "B13", "B14"]);
// Legacy-path line items drop the (prorated) incentive from the
// components, so the disbursed payslip's gross is short by that amount.
const PAY03_DISBURSED_GROSS: Record<string, number> = {
  S02: 22493,
  S08: 20083,
  S13: 12050,
  S14: 12050,
};

const idFor = (i: number) =>
  `7c00000000000000000000${String(i + 1).padStart(2, "0")}`;
let server: http.Server;
let base: string;
const results: Array<Record<string, unknown>> = [];

async function seed() {
  for (const c of ["tenants", "users", "tenant_memberships"]) {
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Payroll",
        slug: "it-payroll",
        dbName: DB,
        isActive: true,
      },
    ],
  });
  const users = [
    {
      _id: oid(HR),
      username: "it-hr",
      email: "hr@example.test",
      tenantId: oid(TENANT),
      employeeStatus: "Active",
      isSuperUser: false,
      permissions: [],
      role: [],
    },
    ...SCENARIOS.map((s, i) => ({
      _id: oid(idFor(i)),
      username: `it-${s.key.toLowerCase()}`,
      email: `${s.key.toLowerCase()}@example.test`,
      first_name: "Test",
      pan_no: PAN,
      dob: { $date: DOB.toISOString() },
      last_name: s.key,
      tenantId: oid(TENANT),
      employeeStatus: s.lastWorkingDay ? "Resigned" : "Active",
      ...(s.joining
        ? { joining_date: { $date: s.joining.toISOString() } }
        : {}),
      isSuperUser: false,
      permissions: [],
      role: [],
    })),
  ];
  await prisma.$runCommandRaw({ insert: "users", documents: users });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: [
      {
        _id: oid("7d0000000000000000000000"),
        tenantId: oid(TENANT),
        userId: oid(HR),
        role: "hr",
      },
    ],
  });

  const t = getClientForDb(DB) as any;
  await runWithTenant(TENANT, t, async () => {
    for (const m of [
      "salaryStructure",
      "attendanceRecord",
      "leaveApplication",
      "leaveBalance",
      "payrollLineItem",
      "payrollRun",
      "resignation",
      "holiday",
      "tenantSettings",
    ]) {
      await t[m].deleteMany({});
    }
    for (const [i, s] of SCENARIOS.entries()) {
      const userId = idFor(i);
      await t.salaryStructure.create({
        data: s.breakdown
          ? {
              tenantId: TENANT,
              userId,
              grossSalary: GROSS,
              grossEarnings: GROSS,
              month: MONTH,
              year: YEAR,
              componentBreakdown: [
                {
                  code: "BASIC",
                  name: "Basic",
                  type: "earning",
                  amount: 15000,
                },
                { code: "HRA", name: "HRA", type: "earning", amount: 7500 },
                {
                  code: "CONVEYANCE",
                  name: "Conveyance",
                  type: "earning",
                  amount: 1600,
                },
                {
                  code: "SPECIAL",
                  name: "Special Allowance",
                  type: "earning",
                  amount: 5900,
                },
              ],
            }
          : {
              tenantId: TENANT,
              userId,
              grossSalary: GROSS,
              grossEarnings: GROSS,
              basicPay: 15000,
              hra: 7500,
              conveyance: 1600,
              incentive: 5900,
              month: MONTH,
              year: YEAR,
            },
      });
      for (const day of s.present) {
        await t.attendanceRecord.create({
          data: {
            tenantId: TENANT,
            userId,
            date: d(day),
            status: "Present",
            timeIn: d(day),
          },
        });
      }
      for (const day of s.halfDays ?? []) {
        await t.attendanceRecord.create({
          data: {
            tenantId: TENANT,
            userId,
            date: d(day),
            status: "Half Day",
            timeIn: d(day),
          },
        });
      }
      for (const l of s.leaves ?? []) {
        await t.leaveApplication.create({
          data: {
            tenantId: TENANT,
            userId,
            leaveType: l.type,
            from: l.from,
            to: l.to,
            days: l.days,
            status: l.status,
            unit: l.unit ?? "full_day",
            appliedOn: d(1),
            ...(l.status === "Approved" ? { approvedOn: d(1) } : {}),
          },
        });
      }
      if (s.ledgerUsedPL !== undefined) {
        await t.leaveBalance.create({
          data: {
            tenantId: TENANT,
            userId,
            accumulatedPLBeforeCurrentMonth: 0,
            balances: [
              {
                month: MONTH,
                year: YEAR,
                earnedPL: 2,
                usedPL: s.ledgerUsedPL,
                usedLWP: 0,
                remainingPL: 0,
              },
            ],
          },
        });
      } else if (s.flatBalances) {
        await t.leaveBalance.create({
          data: {
            tenantId: TENANT,
            userId,
            accumulatedPLBeforeCurrentMonth: 0,
            balances: s.flatBalances,
          },
        });
      }
      if (s.lastWorkingDay) {
        await t.resignation.create({
          data: {
            tenantId: TENANT,
            userId,
            lastWorkingDay: s.lastWorkingDay,
            status: "Approved",
          },
        });
      }
    }
  });
}

function payslip(userId: string): Promise<any> {
  const t = getClientForDb(DB) as any;
  return runWithTenant(
    TENANT,
    t,
    () =>
      new Promise((resolve) =>
        getPayslip(
          { request: { userId, month: MONTH, year: YEAR } } as any,
          (_e: unknown, r: any) => resolve(r),
        ),
      ),
  );
}

beforeAll(async () => {
  clearAccountAccessCache();
  await seed();
  const app = express();
  app.use((_q, _s, next) => withUserAccessScope(next));
  app.use(express.json());
  app.post("/payroll/runs", authenticate, initiatePayrollRun);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise((r) => server.close(r));
  writeFileSync(
    process.env.PAYROLL_RESULTS_FILE || "/dev/null",
    JSON.stringify(results, null, 2),
  );
  await prisma.$disconnect();
});

describe("payroll characterization — September 2026, synthetic employees", () => {
  let lineByUser = new Map<string, any>();

  it("the REAL payroll run completes for all scenarios", async () => {
    const token = jwt.sign(
      { userId: HR, tenantId: TENANT, tenantRole: "hr", dbName: DB },
      process.env.ACCESS_JWT_TOKEN!,
      { algorithm: "HS256" },
    );
    const res = await fetch(`${base}/payroll/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ month: MONTH, year: YEAR }),
    });
    const body = await res.json();
    expect([200, 201]).toContain(res.status);
    const t = getClientForDb(DB) as any;
    const items = await runWithTenant(TENANT, t, () =>
      t.payrollLineItem.findMany({}),
    );
    lineByUser = new Map(items.map((li: any) => [li.userId, li]));
    expect(items.length).toBe(SCENARIOS.length);
    void body;
  });

  it.each(SCENARIOS.map((s, i) => [s.key, s.label, i] as const))(
    "%s %s",
    async (key, label, i) => {
      const s = SCENARIOS[i];
      const userId = idFor(i);
      const li = lineByUser.get(userId);
      const runPaidDays = li
        ? Math.round((li.grossSalary / GROSS) * DAYS * 10) / 10
        : null;
      const slip = await payslip(userId);
      const summary =
        slip?.data?.attendanceSummary ?? slip?.attendanceSummary ?? {};
      // The USER-VISIBLE payslip: the gateway PDF.
      const t = getClientForDb(DB) as any;
      const pdf: any = await runWithTenant(TENANT, t, () =>
        buildSalarySlipPdf(userId, YEAR, MONTH, TENANT),
      );
      let pdfPaidDays: number | null = null;
      let pdfLopDays: number | null = null;
      let pdfTextOut = "";
      if (pdf?.buffer) {
        pdfTextOut = await pdfText(
          pdf.buffer,
          derivePdfPassword(PAN, DOB.toISOString())!,
        );
        const num = (label: string) => {
          const m =
            pdfTextOut.match(new RegExp(`${label}\\s*([0-9]+(?:\\.[0-9])?)`)) ??
            pdfTextOut.match(new RegExp(`([0-9]+(?:\\.[0-9])?)\\s*${label}`));
          return m ? Number(m[1]) : null;
        };
        pdfPaidDays = num("Paid Days");
        pdfLopDays = num("LOP Days");
      }
      const row = {
        key,
        label,
        runGross: li?.grossSalary ?? null,
        runPaidDays,
        pdfPaidDays,
        pdfLopDays,
        pdfError: pdf?.error ?? null,
        pdfText: pdfTextOut,
        salaryServiceSummaryPaidDays: summary.paidDays ?? null, // internal, not shown to users
        salaryServiceSummaryPaidLeaves: summary.paidLeaves ?? null,
        paidIfLeavePaid: s.paidIfLeavePaid,
        lostPaidDays:
          runPaidDays != null
            ? Math.round((s.paidIfLeavePaid - runPaidDays) * 10) / 10
            : null,
      };
      results.push(row);
      // CHARACTERIZATION of today's behaviour (no policy asserted):
      //  - approved paid leave is not paid → runPaidDays as recorded.
      //  - for mid-month joiners/leavers the payslip credits the whole
      //    month's weekends (19 paid / 11 LOP) while the run pays 15 days.
      // When either is fixed this test FAILS on purpose: update the
      // expectation together with the approved rule.
      expect(row.runPaidDays).toBe(EXPECTED_RUN_PAID_DAYS[key]);
      if (PAY02_KEYS.has(key)) {
        expect(row.pdfPaidDays).toBe(19); // known defect (payslip window)
        expect(row.pdfLopDays).toBe(11);
      } else {
        expect(row.pdfPaidDays).toBeCloseTo(row.runPaidDays!, 1);
        expect(row.pdfLopDays).toBeCloseTo(DAYS - row.runPaidDays!, 1);
      }
    },
  );
});

describe("payslip AFTER the run is disbursed (stored line items)", () => {
  it.each([
    ["S02", 1],
    ["S08", 7],
    ["S13", 12],
    ["S14", 13],
    ["B02", 17],
    ["B13", 18],
  ] as const)(
    "%s payslip amounts vs the disbursed line item",
    async (key, i) => {
      const t = getClientForDb(DB) as any;
      await runWithTenant(TENANT, t, () =>
        t.payrollRun.updateMany({
          where: { month: MONTH, year: YEAR },
          data: { status: "disbursed" },
        }),
      );
      const userId = idFor(i);
      const li = await runWithTenant(TENANT, t, () =>
        t.payrollLineItem.findFirst({ where: { userId } }),
      );
      const pdf: any = await runWithTenant(TENANT, t, () =>
        buildSalarySlipPdf(userId, YEAR, MONTH, TENANT),
      );
      const text = await pdfText(
        pdf.buffer,
        derivePdfPassword(PAN, DOB.toISOString())!,
      );
      const lines = text.split("\n").filter((l) => l.trim());
      const after = (label: string) =>
        lines[lines.findIndex((l) => l.trim() === label) + 1];
      const row = {
        key: `${key}-disbursed`,
        lineItemGross: li.grossSalary,
        pdfGross: Number(
          String(after("Gross Earnings")).replace(/Rs\. |,/g, ""),
        ),
        pdfPaidDays: Number(after("Paid Days")),
        pdfLopDays: Number(after("LOP Days")),
      };
      results.push(row);
      if (key in PAY03_DISBURSED_GROSS) {
        expect(row.pdfGross).toBe(PAY03_DISBURSED_GROSS[key]); // known defect (legacy incentive)
        expect(row.pdfGross).toBeLessThan(row.lineItemGross);
      } else {
        expect(row.pdfGross).toBeCloseTo(row.lineItemGross, 0);
      }
      if (PAY02_KEYS.has(key)) expect(row.pdfPaidDays).toBe(19); // known defect (payslip window)
    },
  );
});
