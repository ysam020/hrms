import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { submitResignation } from "../handlers/submitResignation";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    team: { findMany: jest.fn() },
    tenantSettings: { findFirst: jest.fn() },
    noticePeriodPolicy: { findMany: jest.fn() },
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

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue(undefined),
  }),
  getEmailQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

import { getNotificationQueue } from "@hrms/queue";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/approval-engine", () => ({
  instantiateApproval: jest.fn().mockResolvedValue({
    instanceId: "instance-1",
    firstApproverId: "manager-1",
    usedDefaultChain: true,
  }),
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockResignationFindFirst = (prisma as any).resignation
  .findFirst as jest.Mock;
const mockResignationCreate = (prisma as any).resignation.create as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockTeamFindMany = (prisma as any).team.findMany as jest.Mock;
const mockTenantSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockNoticePeriodPolicyFindMany = (prisma as any).noticePeriodPolicy
  .findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockGetNotificationQueue = getNotificationQueue as jest.Mock;

const validRequest = {
  userId: "john",
  resignationDate: "2024-04-01",
};

describe("submitResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockResignationFindFirst.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue(null);
    mockTeamFindMany.mockResolvedValue([]);
    // No NoticePeriodPolicy rows -> flat 30-day fallback, matching today's
    // TenantSettings.noticePeriodDays default for every existing test here.
    mockTenantSettingsFindFirst.mockResolvedValue({
      noticePeriodDays: 30,
      probationPeriodDays: 90,
    });
    mockNoticePeriodPolicyFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await submitResignation(makeCall({ resignationDate: "2024-04-01" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when resignationDate is missing", async () => {
    const cb = makeCallback();
    await submitResignation(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns ALREADY_EXISTS when active resignation already exists", async () => {
    mockResignationFindFirst.mockResolvedValue({
      id: "res-1",
      status: "Submitted",
    });

    const cb = makeCallback();
    await submitResignation(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ACTIVE_RESIGNATION_EXISTS,
      status: status.ALREADY_EXISTS,
    });
    expect(mockResignationCreate).not.toHaveBeenCalled();
  });

  it("checks for existing Submitted or Approved resignation (not Rejected)", async () => {
    mockResignationFindFirst.mockResolvedValue(null);
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    expect(mockResignationFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "john",
        tenantId: "t1",
        status: { in: ["Submitted", "Approved"] },
      },
    });
  });

  it("creates resignation with status 'Submitted' on happy path", async () => {
    const resignation = {
      id: "res-1",
      userId: "john",
      resignationDate: new Date("2024-04-01"),
      status: "Submitted",
    };
    mockResignationCreate.mockResolvedValue(resignation);

    const cb = makeCallback();
    await submitResignation(
      makeCall({
        ...validRequest,
        lastDate: "2024-04-30",
        reason: "Better opportunity",
        overallJobSatisfaction: "4.5",
        suggestions: "Improve processes",
      }),
      cb,
    );

    expect(mockResignationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "john",
          resignationDate: expect.any(Date),
          lastWorkingDay: expect.any(Date),
          reason: "Better opportunity",
          overallJobSatisfaction: 4.5,
          suggestions: "Improve processes",
          status: "Submitted",
          submittedOn: expect.any(Date),
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.RESIGNATION_SUBMITTED,
        status: status.OK,
        data: expect.objectContaining({
          id: "res-1",
          userId: "john",
          status: "Submitted",
          resignationDate: "2024-04-01T00:00:00.000Z",
        }),
      }),
    );
  });

  it("sets optional fields to null/0 defaults when not provided", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    expect(mockResignationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: null,
          overallJobSatisfaction: 0,
          suggestions: null,
        }),
      }),
    );
  });

  it("defaults lastWorkingDay from the resolved notice period when not proposed", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    const call = mockResignationCreate.mock.calls[0][0];
    const resignationDate = call.data.resignationDate as Date;
    const lastWorkingDay = call.data.lastWorkingDay as Date;
    const daysApart = Math.round(
      (lastWorkingDay.getTime() - resignationDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    expect(daysApart).toBe(30); // flat TenantSettings.noticePeriodDays fallback
    expect(call.data.noticePeriodDays).toBe(30);
    expect(call.data.exitType).toBe("voluntary");
  });

  it("absconding has no notice period — lastWorkingDay defaults to the resignation date itself", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(
      makeCall({ ...validRequest, exitType: "absconding" }),
      makeCallback(),
    );

    const call = mockResignationCreate.mock.calls[0][0];
    expect(call.data.noticePeriodDays).toBe(0);
    expect(call.data.lastWorkingDay).toEqual(call.data.resignationDate);
    // Tenure/designation lookup for notice-period resolution is skipped
    // entirely for absconding — only the (separate) notification fan-out
    // looks up the applicant's username.
    expect(mockUserFindUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ joining_date: true }),
      }),
    );
  });

  it("rejects an invalid exitType", async () => {
    const cb = makeCallback();
    await submitResignation(
      makeCall({ ...validRequest, exitType: "not_a_real_type" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INVALID_EXIT_TYPE,
      status: status.INVALID_ARGUMENT,
    });
    expect(mockResignationCreate).not.toHaveBeenCalled();
  });

  it("invalidates resignations cache after submission", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockResignationFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await submitResignation(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });

  it("enqueues notification when HR users exist", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    mockResignationCreate.mockResolvedValue({ id: "res-1" });
    mockUserFindMany.mockResolvedValue([{ id: "u1", username: "hr1" }]);

    await submitResignation(makeCall(validRequest), makeCallback());
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueue.add).toHaveBeenCalledWith(
      "resignationSubmitted",
      expect.objectContaining({ recipients: ["u1"] }),
    );
  });

  it("includes team leader in notification when team has a leader", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    mockResignationCreate.mockResolvedValue({ id: "res-1" });
    mockUserFindMany
      .mockResolvedValueOnce([]) // HR users (first findMany call)
      .mockResolvedValueOnce([{ id: "tl1", username: "leader1" }]); // team leader users
    mockTeamFindMany.mockResolvedValue([{ teamLeaderId: "leader1" }]);

    await submitResignation(makeCall(validRequest), makeCallback());
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueue.add).toHaveBeenCalledWith(
      "resignationSubmitted",
      expect.objectContaining({ recipients: ["tl1"] }),
    );
  });
});
