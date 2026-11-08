import { notify } from "@hrms/notifications";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { approveResignation } from "../handlers/approveResignation";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: { findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
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

const mockFindFirst = (prisma as any).resignation.findFirst as jest.Mock;
const mockUpdate = (prisma as any).resignation.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const resignation = { id: "res-1", username: "john", status: "Submitted" };

describe("approveResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...resignation, status: "Approved" });
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await approveResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the current tenant", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await approveResignation(makeCall({ id: "res-1" }), cb);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "res-1", tenantId: "t1" },
    });
  });

  it("returns NOT_FOUND when resignation does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await approveResignation(makeCall({ id: "res-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION when resignation is not Submitted", async () => {
    mockFindFirst.mockResolvedValue({ ...resignation, status: "Approved" });
    const cb = makeCallback();
    await approveResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("approves resignation and invalidates cache", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await approveResignation(
      makeCall({ id: "res-1", lastWorkingDay: "2024-03-31" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res-1" },
        data: expect.objectContaining({ status: "Approved" }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("persists the request's remarks field into the comments column", async () => {
    // `remarks` is the real UpdateStatusRequest proto field — `comments`
    // was never actually part of it, so nothing sent under that name ever
    // reached the database.
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await approveResignation(
      makeCall({ id: "res-1", remarks: "Approved with notice waived" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          comments: "Approved with notice waived",
        }),
      }),
    );
  });

  it("does not send the resignation back on the wire (BasicResponse has no data field)", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await approveResignation(makeCall({ id: "res-1" }), cb);
    const [, payload] = cb.mock.calls[0];
    expect(payload).not.toHaveProperty("data");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await approveResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});

// What the notification worker expects (NotificationJobData): the job's
// tenant, recipients as user ids — never usernames — and no legacy
// targetUser / pushTargets or broadcast that could widen the audience.
function expectRecipientsOnly(
  job: any,
  {
    tenantId,
    userId,
    username,
  }: { tenantId: string; userId: string; username?: string },
) {
  expect(job.tenantId).toBe(tenantId);
  expect(job.recipients).toEqual([userId]);
  if (username) expect(job.recipients).not.toContain(username);
  expect(job).not.toHaveProperty("targetUser");
  expect(job).not.toHaveProperty("pushTargets");
  expect(job).not.toHaveProperty("broadcast");
  expect(job.inApp).toEqual(
    expect.objectContaining({
      title: expect.any(String),
      message: expect.any(String),
      eventType: expect.any(String),
    }),
  );
}

const flushNotifications = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe("approveResignation notification", () => {
  const USER = "a00000000000000000000003";
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("notifies the employee by user id (not username), in the request's tenant, with no broadcast fields", async () => {
    mockFindFirst.mockResolvedValue({ ...resignation, userId: USER });
    mockUpdate.mockResolvedValue({
      ...resignation,
      userId: USER,
      status: "Approved",
    });
    await approveResignation(
      makeCall({ id: "res-1", lastWorkingDay: "2024-03-31" }),
      makeCallback(),
    );
    await flushNotifications();

    expect(notify).toHaveBeenCalledTimes(1);
    const job = (notify as jest.Mock).mock.calls[0][0];
    expectRecipientsOnly(job, {
      tenantId: "t1",
      userId: USER,
      username: "john",
    });
    expect(job.event).toBe("resignationApproved");
  });

  it("a resignation with no user id produces a job naming nobody — refused by the worker, never broadcast", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    mockUpdate.mockResolvedValue({
      ...resignation,
      userId: null,
      status: "Approved",
    });
    await approveResignation(
      makeCall({ id: "res-1", lastWorkingDay: "2024-03-31" }),
      makeCallback(),
    );
    await flushNotifications();

    // The worker fails such a job permanently ("names no recipients"),
    // so it ends in the dead-letter queue rather than reaching anyone.
    expect(notify).toHaveBeenCalledTimes(1);
    const job = (notify as jest.Mock).mock.calls[0][0];
    expect(job.recipients).toEqual([]);
    expect(job).not.toHaveProperty("targetUser");
    expect(job).not.toHaveProperty("pushTargets");
    expect(job).not.toHaveProperty("broadcast");
  });
});
