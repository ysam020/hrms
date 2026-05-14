import { prisma } from "@hrms/db";
import { updateLeaveBalance } from "../handlers/updateLeaveBalance";

jest.mock("@hrms/db", () => ({
  prisma: {
    leaveBalance: { upsert: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpsert = (prisma as any).leaveBalance.upsert as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("updateLeaveBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({
      userId: "john",
      balances: [],
      accumulatedPLBeforeCurrentMonth: 0,
    });
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await updateLeaveBalance(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts leave balance with provided fields", async () => {
    const cb = makeCallback();
    await updateLeaveBalance(
      makeCall({
        userId: "john",
        balances: [{ month: 3 }],
        accumulatedPLBeforeCurrentMonth: 5,
      }),
      cb,
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "john" },
        create: expect.objectContaining({
          userId: "john",
          accumulatedPLBeforeCurrentMonth: 5,
        }),
        update: expect.objectContaining({
          balances: [{ month: 3 }],
          accumulatedPLBeforeCurrentMonth: 5,
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("creates with defaults when optional fields omitted", async () => {
    const cb = makeCallback();
    await updateLeaveBalance(makeCall({ userId: "john" }), cb);
    const upsertArgs = mockUpsert.mock.calls[0][0];
    expect(upsertArgs.create.accumulatedPLBeforeCurrentMonth).toBe(0);
  });

  it("returns INTERNAL on database error", async () => {
    mockUpsert.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateLeaveBalance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
