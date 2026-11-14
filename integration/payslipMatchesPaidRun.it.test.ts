/**
 * The payslip an employee receives must show what the payroll run paid,
 * not a fresh recalculation from today's salary and attendance.
 *
 * Real tenant database (up.sh) and the REAL payslip builder; its gRPC call
 * to salary-service is routed to the real salary-service handler
 * in-process (same as payrollScenarios.it.test.ts). Synthetic identity only.
 *
 * it.failing marks the correct behaviour for a gap that is still open (see
 * payrollMoneyRegressions.it.test.ts for the convention).
 */
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

import { prisma, getClientForDb, runWithTenant } from "@hrms/db";
import {
  buildSalarySlipPdf,
  derivePdfPassword,
} from "../apps/api-gateway/src/handlers/salary";

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

const TENANT = "7f00000000000000000002a1";
const DB = "hrms-it-payslip";
const EMP = "7f00000000000000000002e1";
const HR = "7f00000000000000000002e2";
const RUN = "7f00000000000000000002d1";
const MONTH = 8;
const YEAR = 2031;
const PAN = "ABCDE1234F";
const DOB = new Date(Date.UTC(1990, 0, 1));
const oid = (id: string) => ({ $oid: id });
const db = getClientForDb(DB) as any;

// Configured salary 30,000; the run actually paid 12,345 (for example after
// loss of pay). A payslip for the paid month must say 12,345.
const PAID_GROSS = 12345;

async function clear() {
  await db.payrollLineItem.deleteMany({});
  await db.payrollRun.deleteMany({});
  await db.salaryStructure.deleteMany({});
  await prisma.user.deleteMany({ where: { id: EMP } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
}

async function seed(runStatus: string) {
  await clear();
  await prisma.tenant.create({
    data: {
      id: TENANT,
      name: "IT Payslip Tenant",
      slug: "it-payslip",
      dbName: DB,
    },
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      {
        _id: oid(EMP),
        username: "it-payslip-employee",
        email: "it-payslip-employee@example.test",
        first_name: "Synthetic",
        last_name: "Employee",
        pan_no: PAN,
        dob: { $date: DOB.toISOString() },
        tenantId: oid(TENANT),
        employeeStatus: "Active",
        isSuperUser: false,
        permissions: [],
        role: [],
      },
    ],
  });
  await db.salaryStructure.create({
    data: {
      tenantId: TENANT,
      userId: EMP,
      grossSalary: 30000,
      grossEarnings: 30000,
      basicPay: 15000,
      hra: 7500,
      conveyance: 1600,
      incentive: 5900,
      month: MONTH,
      year: YEAR,
    },
  });
  await db.payrollRun.create({
    data: {
      id: RUN,
      tenantId: TENANT,
      month: MONTH,
      year: YEAR,
      status: runStatus,
      initiatedBy: HR,
      approvedBy: HR,
      totalGross: PAID_GROSS,
      totalNet: PAID_GROSS,
      totalDeductions: 0,
      employeeCount: 1,
    },
  });
  await db.payrollLineItem.create({
    data: {
      tenantId: TENANT,
      payrollRunId: RUN,
      userId: EMP,
      grossSalary: PAID_GROSS,
      basicPay: 6000,
      hra: 3000,
      conveyance: 1000,
      incentive: 2345,
      pf: 0,
      esi: 0,
      pt: 0,
      tds: 0,
      advanceDeduction: 0,
      totalDeductions: 0,
      netPayable: PAID_GROSS,
      postProcessed: true,
    },
  });
}

async function payslipText(): Promise<string> {
  const slip: any = await runWithTenant(TENANT, db, () =>
    buildSalarySlipPdf(EMP, YEAR, MONTH, TENANT),
  );
  expect(slip?.error).toBeUndefined();
  return pdfText(slip.buffer, derivePdfPassword(PAN, DOB.toISOString())!);
}

const mentionsPaidGross = (text: string) =>
  /12,?345/.test(text.replace(/\s+/g, " "));

let reachedFailing = false;

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
  if (!reachedFailing) {
    throw new Error(
      "the expected-failure payslip test never reached its assertion",
    );
  }
});

it("once the run is recorded as disbursed, the payslip shows what the run paid", async () => {
  await seed("disbursed");
  expect(mentionsPaidGross(await payslipText())).toBe(true);
});

(process.env.OPEN_GAPS_AS_PLAIN ? it : it.failing)(
  "while the run is still paying out (when payslip emails are generated), the payslip already shows what the run paid",
  async () => {
    await seed("disbursing");
    const text = await payslipText();
    reachedFailing = true;
    expect(mentionsPaidGross(text)).toBe(true);
  },
);
