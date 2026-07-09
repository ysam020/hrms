import { status } from "@grpc/grpc-js";
import { prisma, getTenantId } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { applyForJob } from "../handlers/applyForJob";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    jobOpening: { findUnique: jest.fn() },
    jobApplication: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
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
  getResumeParsingQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { getNotificationQueue } from "@hrms/queue";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockJobFindUnique = (prisma as any).jobOpening.findUnique as jest.Mock;
const mockAppFindFirst = (prisma as any).jobApplication.findFirst as jest.Mock;
const mockAppCreate = (prisma as any).jobApplication.create as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserFindFirst = prisma.user.findFirst as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockGetNotificationQueue = getNotificationQueue as jest.Mock;

const openJob = {
  id: "job-1",
  jobTitle: "Engineer",
  status: "Open",
  hiringManager: null,
};
const validRequest = {
  jobTitleId: "job-1",
  name: "Alice",
  email: "alice@example.com",
};

describe("applyForJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockUserFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when jobTitleId, name, or email is missing", async () => {
    const cb = makeCallback();
    await applyForJob(
      makeCall({ name: "Alice", email: "alice@example.com" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_TITLE_ID_NAME_EMAIL_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when name is missing", async () => {
    const cb = makeCallback();
    await applyForJob(
      makeCall({ jobTitleId: "job-1", email: "alice@example.com" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_TITLE_ID_NAME_EMAIL_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns FAILED_PRECONDITION instead of writing a corrupted record when tenant context is missing (e.g. resolvePublicTenant didn't run)", async () => {
    (getTenantId as jest.Mock).mockReturnValueOnce(null);
    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.TENANT_REQUIRED,
      status: status.FAILED_PRECONDITION,
    });
    expect(mockJobFindUnique).not.toHaveBeenCalled();
    expect(mockAppCreate).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when job opening does not exist", async () => {
    mockJobFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_NOT_FOUND_OR_CLOSED,
      status: status.NOT_FOUND,
    });
  });

  it("returns NOT_FOUND when job is closed", async () => {
    mockJobFindUnique.mockResolvedValue({ ...openJob, status: "Closed" });
    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_NOT_FOUND_OR_CLOSED,
      status: status.NOT_FOUND,
    });
  });

  it("returns ALREADY_EXISTS when applicant has already applied", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue({
      id: "app-1",
      email: "alice@example.com",
    });

    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ALREADY_APPLIED,
      status: status.ALREADY_EXISTS,
    });
  });

  it("creates application with status 'Applied' on happy path", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    const application = {
      id: "app-1",
      jobTitleId: "job-1",
      name: "Alice",
      email: "alice@example.com",
      status: "Applied",
    };
    mockAppCreate.mockResolvedValue(application);

    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);

    expect(mockAppCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobTitleId: "job-1",
          name: "Alice",
          email: "alice@example.com",
          status: "Applied",
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.APPLICATION_SUBMITTED,
      status: status.OK,
      data: {
        id: application.id,
        jobTitleId: application.jobTitleId,
        name: application.name,
        email: application.email,
        mobile: "",
        status: application.status,
        resumeScore: 0,
        aiNotes: "",
      },
    });
  });

  it("sets optional fields to null when not provided", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app-1" });

    await applyForJob(makeCall(validRequest), makeCallback());

    expect(mockAppCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mobile: null,
          resume: null,
          reason: null,
          aadharNo: null,
        }),
      }),
    );
  });

  it("invalidates applications cache after successful submission", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app-1" });

    await applyForJob(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("applications:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockJobFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });

  it("enqueues notification when HR users exist", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({
      id: "app-1",
      ...validRequest,
      status: "Applied",
    });
    mockUserFindMany.mockResolvedValue([{ id: "u1", username: "hr1" }]);

    await applyForJob(makeCall(validRequest), makeCallback());
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueue.add).toHaveBeenCalledWith(
      "jobApplicationReceived",
      expect.objectContaining({ recipients: ["u1"] }),
    );
  });

  it("includes hiring manager in notification when hiringManager is set and found", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    const jobWithManager = { ...openJob, hiringManager: "manager1" };
    mockJobFindUnique.mockResolvedValue(jobWithManager);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({
      id: "app-1",
      ...validRequest,
      status: "Applied",
    });
    mockUserFindMany.mockResolvedValue([]); // no HR users
    mockUserFindFirst.mockResolvedValue({ id: "hm1", username: "manager1" });

    await applyForJob(makeCall(validRequest), makeCallback());
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockUserFindFirst).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith(
      "jobApplicationReceived",
      expect.objectContaining({ recipients: ["hm1"] }),
    );
  });
});
