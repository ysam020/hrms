import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { createSalaryStructure } from "../handlers/createSalaryStructure";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    salaryStructure: { create: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockCreate = (prisma as any).salaryStructure.create as jest.Mock;

describe("createSalaryStructure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when required fields are missing", async () => {
    const cb = makeCallback();
    await createSalaryStructure(
      makeCall({ userId: "john", basicPay: "50000" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_BASIC_MONTH_YEAR_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await createSalaryStructure(
      makeCall({ basicPay: "50000", month: "3", year: "2024" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_BASIC_MONTH_YEAR_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("calculates gross earnings as sum of basic, hra, conveyance, incentive", async () => {
    const created = { id: "sal-1" };
    mockCreate.mockResolvedValue(created);

    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "40000",
        hra: "10000",
        conveyance: "2000",
        incentive: "3000",
        month: "3",
        year: "2024",
      }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossEarnings: 55000, // 40000 + 10000 + 2000 + 3000
          grossSalary: 55000,
        }),
      }),
    );
  });

  it("calculates total deductions as sum of pf, esi, pt, deductions", async () => {
    mockCreate.mockResolvedValue({ id: "sal-1" });

    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "50000",
        pf: "1800",
        esi: "750",
        pt: "200",
        deductions: "500",
        month: "3",
        year: "2024",
      }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deductions: 3250, // 1800 + 750 + 200 + 500
        }),
      }),
    );
  });

  it("calculates net payable as gross earnings minus total deductions", async () => {
    mockCreate.mockResolvedValue({ id: "sal-1" });

    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "50000",
        hra: "10000",
        pf: "1800",
        esi: "750",
        month: "3",
        year: "2024",
      }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          netPayable: 57450, // (50000 + 10000) - (1800 + 750)
        }),
      }),
    );
  });

  it("defaults missing optional fields to 0 in calculations", async () => {
    mockCreate.mockResolvedValue({ id: "sal-1" });

    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "30000",
        month: "3",
        year: "2024",
      }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossEarnings: 30000,
          deductions: 0,
          netPayable: 30000,
        }),
      }),
    );
  });

  it("parses month and year as integers", async () => {
    mockCreate.mockResolvedValue({ id: "sal-1" });

    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "30000",
        month: "3",
        year: "2024",
      }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ month: 3, year: 2024 }),
      }),
    );
  });

  it("returns OK with created structure on happy path", async () => {
    const structure = {
      id: "sal-1",
      userId: "john",
      basicPay: 50000,
      netPayable: 48000,
    };
    mockCreate.mockResolvedValue(structure);

    const cb = makeCallback();
    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "50000",
        month: "3",
        year: "2024",
      }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.SALARY_STRUCTURE_CREATED,
      status: status.OK,
      data: structure,
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await createSalaryStructure(
      makeCall({
        userId: "john",
        basicPay: "50000",
        month: "3",
        year: "2024",
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
