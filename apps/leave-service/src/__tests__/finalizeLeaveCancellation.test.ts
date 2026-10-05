import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { finalizeLeaveCancellation } from "../handlers/finalizeLeaveCancellation";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db: any = {
    leaveApplication: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    tenantSettings: {
      findFirst: jest.fn(),
    },
    leaveBalance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    compOffCredit: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  // The status flip + balance credit-back run inside prisma.$transaction(async
  // (tx) => ...) — the mock passes the same mocked delegates back as `tx` so
  // existing per-model mocks apply whether the real code calls them via
  // `prisma` or via `tx`.
  _db.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(_db));
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    invalidatePattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.in>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.leaveApplication.findUnique as jest.Mock;
const mockFindUniqueOrThrow = (prisma as any).leaveApplication
  .findUniqueOrThrow as jest.Mock;
const mockUpdateMany = (prisma as any).leaveApplication.updateMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockBalanceFindFirst = (prisma as any).leaveBalance
  .findFirst as jest.Mock;
const mockBalanceUpdateMany = (prisma as any).leaveBalance
  .updateMany as jest.Mock;

describe("finalizeLeaveCancellation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    // No balance row by default — adjustBalance no-ops.
    mockBalanceFindFirst.mockResolvedValue(null);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await finalizeLeaveCancellation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when leave application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await finalizeLeaveCancellation(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("no-ops when the leave is not in Cancellation Requested state", async () => {
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Approved" });
    const cb = makeCallback();
    await finalizeLeaveCancellation(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_CANCELLED,
      status: status.OK,
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("no-ops when a concurrent finalize already won the race", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Cancellation Requested",
    });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const cb = makeCallback();
    await finalizeLeaveCancellation(
      makeCall({ id: "leave-1", approved: true }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_CANCELLED,
      status: status.OK,
    });
    expect(mockFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockBalanceFindFirst).not.toHaveBeenCalled();
  });

  it("approved path: flips status to Cancelled and credits the balance back inside the transaction", async () => {
    const requested = {
      id: "leave-1",
      status: "Cancellation Requested",
      userId: "john-id",
      leaveType: "PL",
      days: 2,
    };
    const cancelled = { ...requested, status: "Cancelled" };
    mockFindUnique.mockResolvedValue(requested);
    mockFindUniqueOrThrow.mockResolvedValue(cancelled);
    mockBalanceFindFirst.mockResolvedValue({
      id: "bal-1",
      updatedAt: new Date("2024-01-01"),
      balances: { PL: 5 },
    });
    mockBalanceUpdateMany.mockResolvedValue({ count: 1 });

    const cb = makeCallback();
    await finalizeLeaveCancellation(
      makeCall({ id: "leave-1", approved: true }),
      cb,
    );

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "leave-1", status: "Cancellation Requested" },
      data: expect.objectContaining({
        status: "Cancelled",
        cancelledOn: expect.any(Date),
      }),
    });
    // Balance credited back by +days (cancellation reverses the earlier debit).
    expect(mockBalanceUpdateMany).toHaveBeenCalledWith({
      where: { id: "bal-1", updatedAt: new Date("2024-01-01") },
      data: { balances: { PL: 7 } },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
      }),
    );
  });

  it("rejected path: reverts status to Approved and does not touch the balance", async () => {
    const requested = {
      id: "leave-1",
      status: "Cancellation Requested",
      userId: "john-id",
      leaveType: "PL",
      days: 2,
    };
    const reverted = { ...requested, status: "Approved" };
    mockFindUnique.mockResolvedValue(requested);
    mockFindUniqueOrThrow.mockResolvedValue(reverted);

    const cb = makeCallback();
    await finalizeLeaveCancellation(
      makeCall({ id: "leave-1", approved: false }),
      cb,
    );

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "leave-1", status: "Cancellation Requested" },
      data: { status: "Approved", cancellationReason: null },
    });
    expect(mockBalanceFindFirst).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.LEAVE_APPROVED,
        status: status.OK,
      }),
    );
  });

  it("invalidates leave cache after finalizing", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Cancellation Requested",
    });
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "leave-1",
      status: "Approved",
    });

    await finalizeLeaveCancellation(
      makeCall({ id: "leave-1", approved: false }),
      makeCallback(),
    );

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:leaves:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await finalizeLeaveCancellation(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });

  // NOTE on what this test can and can't prove: $transaction is mocked as a
  // bare pass-through (`jest.fn((fn) => fn(_db))`, see the jest.mock block
  // above) — it has no real atomicity, so it cannot demonstrate that the
  // status-flip write is actually rolled back in the database when the
  // balance credit-back later fails. Only a live-MongoDB replica-set
  // integration test could prove that. What this test *does* pin down, at
  // the application level: when a write inside the transaction body
  // rejects, the handler must not report success to the caller, and must
  // not run any post-transaction side effect (cache invalidation) as if
  // the cancellation had gone through.
  it("returns INTERNAL and skips post-transaction side effects when the balance credit-back fails mid-transaction", async () => {
    const requested = {
      id: "leave-1",
      status: "Cancellation Requested",
      userId: "john-id",
      leaveType: "PL",
      days: 2,
    };
    mockFindUnique.mockResolvedValue(requested);
    mockFindUniqueOrThrow.mockResolvedValue({
      ...requested,
      status: "Cancelled",
    });
    mockBalanceFindFirst.mockResolvedValue({
      id: "bal-1",
      updatedAt: new Date("2024-01-01"),
      balances: { PL: 5 },
    });
    mockBalanceUpdateMany.mockRejectedValue(new Error("balance write failed"));

    const cb = makeCallback();
    await finalizeLeaveCancellation(
      makeCall({ id: "leave-1", approved: true }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
