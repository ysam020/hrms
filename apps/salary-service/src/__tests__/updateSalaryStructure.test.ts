import { prisma } from "@hrms/db";
import { updateSalaryStructure } from "../handlers/updateSalaryStructure";

jest.mock("@hrms/db", () => ({
  prisma: {
    salaryStructure: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).salaryStructure.findUnique as jest.Mock;
const mockUpdate = (prisma as any).salaryStructure.update as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const existing = {
  id: "ss-1",
  basicPay: 50000,
  hra: 10000,
  conveyance: 2000,
  incentive: 0,
  pf: 5000,
  esi: 1000,
  pt: 200,
  deductions: 6200,
  grossEarnings: 62000,
  grossSalary: 62000,
  netPayable: 55800,
};

describe("updateSalaryStructure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...existing });
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateSalaryStructure(makeCall({ basicPay: 60000 }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when salary structure does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateSalaryStructure(makeCall({ id: "ss-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("recalculates grossEarnings and netPayable correctly", async () => {
    mockFindUnique.mockResolvedValue(existing);
    const cb = makeCallback();
    // Override basicPay to 60000, keep others from existing
    await updateSalaryStructure(
      makeCall({ id: "ss-1", basicPay: "60000" }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    // grossEarnings = 60000 + 10000 + 2000 + 0 = 72000
    expect(updateData.grossEarnings).toBe(72000);
    // totalDeduct = 5000 + 1000 + 200 + 6200 = 12400
    // netPayable = 72000 - 12400 = 59600
    expect(updateData.netPayable).toBe(59600);
  });

  it("uses existing values when fields not provided", async () => {
    mockFindUnique.mockResolvedValue(existing);
    const cb = makeCallback();
    await updateSalaryStructure(makeCall({ id: "ss-1" }), cb);
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.basicPay).toBe(50000);
    expect(updateData.hra).toBe(10000);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateSalaryStructure(makeCall({ id: "ss-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
