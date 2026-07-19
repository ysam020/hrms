import { checkUserHasHistoricalRecords } from "../userDeletionGuard";
import { prismaWithTenant } from "../prismaWithTenant";

// Every model checkUserHasHistoricalRecords consults — kept as a plain
// object of { count: jest.fn() } per model so the Proxy behavior of the
// real prismaWithTenant (tested in prismaWithTenant.test.ts) doesn't need
// to be re-simulated here.
const CHECKED_MODELS = [
  "attendanceRecord",
  "overtimeRequest",
  "leaveApplication",
  "compOffCredit",
  "leaveBalance",
  "jobApplication",
  "resignation",
  "fnfSettlement",
  "salaryStructure",
  "taxDeclaration",
  "auditLog",
  "loginEvent",
  "payrollLineItem",
  "salaryAdvance",
  "performanceReview",
  "assetAssignment",
  "wfhRequest",
  "ticketComment",
  "tenantJoinRequest",
];

jest.mock("../prismaWithTenant", () => {
  const _db: any = {};
  for (const model of [
    "attendanceRecord",
    "overtimeRequest",
    "leaveApplication",
    "compOffCredit",
    "leaveBalance",
    "jobApplication",
    "resignation",
    "fnfSettlement",
    "salaryStructure",
    "taxDeclaration",
    "auditLog",
    "loginEvent",
    "payrollLineItem",
    "salaryAdvance",
    "performanceReview",
    "assetAssignment",
    "wfhRequest",
    "ticketComment",
    "tenantJoinRequest",
  ]) {
    _db[model] = { count: jest.fn().mockResolvedValue(0) };
  }
  return { prismaWithTenant: _db };
});

const db: any = prismaWithTenant;

describe("checkUserHasHistoricalRecords", () => {
  beforeEach(() => {
    for (const model of CHECKED_MODELS) {
      db[model].count.mockClear();
      db[model].count.mockResolvedValue(0);
    }
  });

  it("returns hasRecords:false when every model reports zero rows", async () => {
    const result = await checkUserHasHistoricalRecords("t1", "u1");
    expect(result).toEqual({ hasRecords: false, models: [] });
  });

  it("queries every checked model scoped to the given tenant and user", async () => {
    await checkUserHasHistoricalRecords("t1", "u1");
    for (const model of CHECKED_MODELS) {
      expect(db[model].count).toHaveBeenCalledWith({
        where: { tenantId: "t1", userId: "u1" },
      });
    }
  });

  it("reports hasRecords:true and names the model when exactly one has data", async () => {
    db.leaveApplication.count.mockResolvedValue(3);
    const result = await checkUserHasHistoricalRecords("t1", "u1");
    expect(result).toEqual({ hasRecords: true, models: ["leaveApplication"] });
  });

  it("names every model that has data, not just the first one found", async () => {
    db.attendanceRecord.count.mockResolvedValue(1);
    db.salaryAdvance.count.mockResolvedValue(2);
    db.ticketComment.count.mockResolvedValue(5);
    const result = await checkUserHasHistoricalRecords("t1", "u1");
    expect(result.hasRecords).toBe(true);
    expect(result.models.sort()).toEqual(
      ["attendanceRecord", "salaryAdvance", "ticketComment"].sort(),
    );
  });

  it("checks every one of the ~18 known user-scoped models (regression guard against silently dropping one)", async () => {
    await checkUserHasHistoricalRecords("t1", "u1");
    const queriedModels = CHECKED_MODELS.filter(
      (m) => db[m].count.mock.calls.length > 0,
    );
    expect(queriedModels.sort()).toEqual([...CHECKED_MODELS].sort());
  });
});
