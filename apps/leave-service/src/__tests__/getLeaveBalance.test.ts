import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getLeaveBalance } from "../handlers/getLeaveBalance";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    leaveBalance: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = (prisma as any).leaveBalance.findUnique as jest.Mock;

describe("getLeaveBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await getLeaveBalance(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NO_LEAVE_BALANCE message when no balance record exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getLeaveBalance(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NO_LEAVE_BALANCE,
      status: status.OK,
      data: null,
      username: "john",
    });
  });

  it("returns balance data when record exists", async () => {
    const balance = {
      id: "bal-1",
      username: "john",
      accumulatedPLBeforeCurrentMonth: 5,
      balances: { casual: 10, sick: 7 },
    };
    mockFindUnique.mockResolvedValue(balance);

    const cb = makeCallback();
    await getLeaveBalance(makeCall({ username: "john" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_FETCHED,
      status: status.OK,
      data: {
        id: "bal-1",
        username: "john",
        accumulatedPlBeforeCurrentMonth: 5,
        balances: JSON.stringify({ casual: 10, sick: 7 }),
      },
      username: "john",
    });
  });

  it("defaults accumulatedPLBeforeCurrentMonth to 0 when null", async () => {
    mockFindUnique.mockResolvedValue({
      id: "bal-1",
      username: "jane",
      accumulatedPLBeforeCurrentMonth: null,
      balances: null,
    });

    const cb = makeCallback();
    await getLeaveBalance(makeCall({ username: "jane" }), cb);

    const result = cb.mock.calls[0][1];
    expect(result.data.accumulatedPlBeforeCurrentMonth).toBe(0);
    expect(result.data.balances).toBe("");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getLeaveBalance(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
