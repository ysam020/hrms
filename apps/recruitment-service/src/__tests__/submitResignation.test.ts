import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { submitResignation } from "../handlers/submitResignation";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    resignation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findMany: jest.fn() },
    team: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockResignationFindFirst = (prisma as any).resignation
  .findFirst as jest.Mock;
const mockResignationCreate = (prisma as any).resignation.create as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockTeamFindMany = (prisma as any).team.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const validRequest = {
  username: "john",
  resignationDate: "2024-04-01",
};

describe("submitResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockResignationFindFirst.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([]);
    mockTeamFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await submitResignation(makeCall({ resignationDate: "2024-04-01" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when resignationDate is missing", async () => {
    const cb = makeCallback();
    await submitResignation(makeCall({ username: "john" }), cb);
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
        username: "john",
        status: { in: ["Submitted", "Approved"] },
      },
    });
  });

  it("creates resignation with status 'Submitted' on happy path", async () => {
    const resignation = {
      id: "res-1",
      username: "john",
      resignationDate: "2024-04-01",
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
          username: "john",
          resignationDate: "2024-04-01",
          lastDate: "2024-04-30",
          reason: "Better opportunity",
          overallJobSatisfaction: 4.5,
          suggestions: "Improve processes",
          status: "Submitted",
          submittedOn: expect.any(Date),
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_SUBMITTED,
      status: status.OK,
      data: resignation,
    });
  });

  it("sets optional fields to null/0 defaults when not provided", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    expect(mockResignationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastDate: null,
          reason: null,
          overallJobSatisfaction: 0,
          suggestions: null,
        }),
      }),
    );
  });

  it("invalidates resignations cache after submission", async () => {
    mockResignationCreate.mockResolvedValue({ id: "res-1" });

    await submitResignation(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("resignations:*");
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
});
