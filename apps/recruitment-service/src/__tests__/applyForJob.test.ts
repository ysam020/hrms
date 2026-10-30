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
    interviewPipelineTemplate: { findFirst: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    candidate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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
  getResumeParsingQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

import { notify } from "@hrms/notifications";

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
const mockPipelineTemplateFindFirst = (prisma as any).interviewPipelineTemplate
  .findFirst as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockNotify = notify as jest.Mock;
const mockCandidateFindFirst = (prisma as any).candidate.findFirst as jest.Mock;
const mockCandidateCreate = (prisma as any).candidate.create as jest.Mock;
const mockCandidateUpdate = (prisma as any).candidate.update as jest.Mock;

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
    mockPipelineTemplateFindFirst.mockResolvedValue(null);
    mockCandidateFindFirst.mockResolvedValue(null);
    mockCandidateCreate.mockResolvedValue({ id: "cand-new" });
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

  it("returns NOT_FOUND when the job's apply-by date has passed", async () => {
    mockJobFindUnique.mockResolvedValue({
      ...openJob,
      applicationDeadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const cb = makeCallback();
    await applyForJob(makeCall(validRequest), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.JOB_NOT_FOUND_OR_CLOSED,
      status: status.NOT_FOUND,
    });
    expect(mockAppCreate).not.toHaveBeenCalled();
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
        candidateId: "",
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
        }),
      }),
    );
  });

  it("invalidates applications cache after successful submission", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app-1" });

    await applyForJob(makeCall(validRequest), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:applications:*");
  });

  it("snapshots the job opening's own pipelineTemplateId when set", async () => {
    mockJobFindUnique.mockResolvedValue({
      ...openJob,
      pipelineTemplateId: "tpl-1",
    });
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app-1" });

    await applyForJob(makeCall(validRequest), makeCallback());

    expect(mockPipelineTemplateFindFirst).not.toHaveBeenCalled();
    expect(mockAppCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pipelineTemplateId: "tpl-1",
          currentStageOrder: 0,
        }),
      }),
    );
  });

  it("falls back to the tenant's default pipeline template when the job opening has none", async () => {
    mockJobFindUnique.mockResolvedValue(openJob); // no pipelineTemplateId
    mockAppFindFirst.mockResolvedValue(null);
    mockPipelineTemplateFindFirst.mockResolvedValue({ id: "default-tpl" });
    mockAppCreate.mockResolvedValue({ id: "app-1" });

    await applyForJob(makeCall(validRequest), makeCallback());

    expect(mockPipelineTemplateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          isDefault: true,
          isActive: true,
        }),
      }),
    );
    expect(mockAppCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pipelineTemplateId: "default-tpl" }),
      }),
    );
  });

  it("never stores Aadhaar, even when an old client still sends it", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app-1" });
    await applyForJob(
      makeCall({ ...validRequest, aadharNo: "123412341234" }),
      makeCallback(),
    );
    expect(mockAppCreate.mock.calls[0][0].data).not.toHaveProperty("aadharNo");
    expect(JSON.stringify(mockCandidateCreate.mock.calls)).not.toContain(
      "123412341234",
    );
  });

  it("checks for an earlier application case-insensitively on a normalised email", async () => {
    mockJobFindUnique.mockResolvedValue(openJob);
    mockAppFindFirst.mockResolvedValue({ id: "old" });
    const cb = makeCallback();
    await applyForJob(
      makeCall({ ...validRequest, email: "  Alice@Example.COM " }),
      cb,
    );
    expect(mockAppFindFirst).toHaveBeenCalledWith({
      where: {
        jobTitleId: "job-1",
        email: { equals: "alice@example.com", mode: "insensitive" },
      },
    });
    expect(cb.mock.calls[0][1].status).toBe(status.ALREADY_EXISTS);
  });

  describe("candidate identity", () => {
    beforeEach(() => {
      mockJobFindUnique.mockResolvedValue(openJob);
      mockAppFindFirst.mockResolvedValue(null);
      mockAppCreate.mockImplementation(async ({ data }: any) => ({
        id: "app-1",
        ...data,
      }));
    });

    it("creates a new candidate for a first-time applicant, without Aadhaar", async () => {
      await applyForJob(makeCall(validRequest), makeCallback());
      expect(mockCandidateCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: "t1",
          email: "alice@example.com",
          emailVerifiedAt: null,
        }),
      });
      expect(mockAppCreate.mock.calls[0][0].data).toMatchObject({
        candidateId: "cand-new",
        possibleDuplicateOfCandidateId: null,
      });
    });

    it("reuses the verified candidate when the applicant verified the same email", async () => {
      mockCandidateFindFirst.mockResolvedValueOnce({ id: "cand-verified" });
      await applyForJob(
        makeCall({
          ...validRequest,
          emailVerified: true,
          mobile: "+919876543210",
        }),
        makeCallback(),
      );
      expect(mockCandidateFindFirst.mock.calls[0][0].where).toEqual({
        email: "alice@example.com",
        emailVerifiedAt: { not: null },
      });
      expect(mockCandidateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "cand-verified" } }),
      );
      expect(mockCandidateCreate).not.toHaveBeenCalled();
      expect(mockAppCreate.mock.calls[0][0].data.candidateId).toBe(
        "cand-verified",
      );
    });

    it("does not merge on an unverified email match — flags it for review instead", async () => {
      mockCandidateFindFirst.mockResolvedValueOnce({ id: "cand-old" });
      await applyForJob(makeCall(validRequest), makeCallback());
      expect(mockCandidateCreate).toHaveBeenCalled();
      expect(mockAppCreate.mock.calls[0][0].data).toMatchObject({
        candidateId: "cand-new",
        possibleDuplicateOfCandidateId: "cand-old",
      });
    });

    it("looks for lookalikes by mobile number too", async () => {
      await applyForJob(
        makeCall({ ...validRequest, mobile: "+919876543210" }),
        makeCallback(),
      );
      expect(mockCandidateFindFirst.mock.calls[0][0].where).toEqual({
        OR: [{ email: "alice@example.com" }, { mobile: "+919876543210" }],
      });
    });

    it("verified applicant with no earlier verified record gets a new candidate, flagged if an unverified lookalike exists", async () => {
      mockCandidateFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "cand-typed" });
      await applyForJob(
        makeCall({ ...validRequest, emailVerified: true }),
        makeCallback(),
      );
      expect(
        mockCandidateCreate.mock.calls[0][0].data.emailVerifiedAt,
      ).toBeInstanceOf(Date);
      expect(
        mockAppCreate.mock.calls[0][0].data.possibleDuplicateOfCandidateId,
      ).toBe("cand-typed");
    });

    it("stores the profile, screening answers and submission time", async () => {
      await applyForJob(
        makeCall({
          ...validRequest,
          profileJson: JSON.stringify({ totalExperience: 4 }),
          screeningAnswersJson: JSON.stringify([
            { questionId: "q1", label: "Visa?", type: "yes_no", value: "yes" },
          ]),
          coverLetter: "Hello",
        }),
        makeCallback(),
      );
      expect(mockAppCreate.mock.calls[0][0].data).toMatchObject({
        profile: { totalExperience: 4 },
        screeningAnswers: [{ questionId: "q1", value: "yes" }],
        coverLetter: "Hello",
        submittedAt: expect.any(Date),
      });
    });
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

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "jobApplicationReceived",
        recipients: ["u1"],
      }),
    );
  });

  it("includes hiring manager in notification when hiringManager is set and found", async () => {
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
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "jobApplicationReceived",
        recipients: ["hm1"],
      }),
    );
  });
});
