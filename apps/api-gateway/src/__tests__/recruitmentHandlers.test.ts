import { prisma } from "@hrms/db";
import {
  viewJobOpenings,
  viewJobOpening,
  addJobOpening,
  editJobOpening,
  deleteJobOpening,
  publicCareers,
  getJobTitles,
  applyForJob,
  viewApplications,
  updateCandidateStatus,
  hireCandidate,
  rejectApplication,
  addResignation,
  viewResignations,
  approveResignation,
  rejectResignation,
  withdrawResignation,
  jobOpeningsInsights,
  scheduleInterview,
  reassignInterviewer,
  getInterviewerList,
  updateResignation,
  resignationInsights,
} from "../handlers/recruitment";

jest.mock("../grpc/clients", () => {
  const fn = jest.fn();
  return { recruitmentClient: {}, grpcCall: fn, recruitmentCall: fn };
});

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    jobOpening: { count: jest.fn(), groupBy: jest.fn() },
    jobApplication: { findUnique: jest.fn(), update: jest.fn() },
    resignation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CREATED: 201,
    INTERNAL_SERVER_ERROR: 500,
  },
  errorMessage: { GENERAL: { INTERNAL_ERROR: "Internal server error" } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockJobCount = (prisma as any).jobOpening.count as jest.Mock;
const mockJobGroupBy = (prisma as any).jobOpening.groupBy as jest.Mock;
const mockAppFindUnique = (prisma as any).jobApplication
  .findUnique as jest.Mock;
const mockAppUpdate = (prisma as any).jobApplication.update as jest.Mock;
const mockResignFindUnique = (prisma as any).resignation
  .findUnique as jest.Mock;
const mockResignUpdate = (prisma as any).resignation.update as jest.Mock;
const mockResignCount = (prisma as any).resignation.count as jest.Mock;
const mockResignFindMany = (prisma as any).resignation.findMany as jest.Mock;
const mockResignFindFirst = (prisma as any).resignation.findFirst as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("recruitmentHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
    mockUserFindUnique.mockResolvedValue({
      username: "admin",
      isSuperUser: false,
    });
    mockUserFindMany.mockResolvedValue([]);
    mockJobCount.mockResolvedValue(5);
    mockJobGroupBy.mockResolvedValue([]);
    mockResignCount.mockResolvedValue(0);
    mockResignFindMany.mockResolvedValue([]);
  });

  it("viewJobOpenings calls listJobOpenings", async () => {
    await viewJobOpenings(makeReq({ query: { status: "Open" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Open" }),
    );
  });

  it("viewJobOpening calls getJobOpening with id", async () => {
    await viewJobOpening(makeReq({ params: { id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "getJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
  });

  it("addJobOpening calls createJobOpening with body data", async () => {
    const res = makeRes();
    await addJobOpening(
      makeReq({ body: { jobTitle: "SWE", experience: 3 } }),
      res,
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "createJobOpening",
      expect.objectContaining({ jobTitle: "SWE" }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("editJobOpening calls updateJobOpening with params id", async () => {
    await editJobOpening(
      makeReq({ params: { _id: "j-1" }, body: { jobTitle: "Senior SWE" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "updateJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
  });

  it("deleteJobOpening calls deleteJobOpening with params id", async () => {
    await deleteJobOpening(makeReq({ params: { _id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "deleteJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
  });

  it("publicCareers calls listJobOpenings with status Open", async () => {
    await publicCareers(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Open" }),
    );
  });

  it("getJobTitles calls listJobOpenings with large limit", async () => {
    await getJobTitles(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "listJobOpenings",
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("applyForJob calls applyForJob with body data", async () => {
    await applyForJob(
      makeReq({ body: { jobId: "j-1", applicantName: "Jane Doe" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "applyForJob",
      expect.objectContaining({ jobId: "j-1" }),
    );
  });

  it("viewApplications calls listApplications with jobTitleId", async () => {
    await viewApplications(makeReq({ params: { id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "listApplications",
      expect.objectContaining({ jobTitleId: "j-1" }),
    );
  });

  it("updateCandidateStatus calls updateApplicationStatus", async () => {
    await updateCandidateStatus(
      makeReq({ body: { id: "app-1", status: "Shortlisted" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Shortlisted" }),
    );
  });

  it("hireCandidate calls updateApplicationStatus with Hired status", async () => {
    await hireCandidate(makeReq({ body: { id: "app-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Hired" }),
    );
  });

  it("rejectApplication calls updateApplicationStatus with Rejected status", async () => {
    await rejectApplication(makeReq({ body: { id: "app-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Rejected" }),
    );
  });

  it("addResignation calls submitResignation with resolved username", async () => {
    // beforeEach mocks findUnique to return { username: "admin", isSuperUser: false }
    await addResignation(
      makeReq({ body: { reason: "Better opportunity" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "submitResignation",
      expect.objectContaining({
        username: "admin",
        reason: "Better opportunity",
      }),
    );
  });

  describe("viewResignations", () => {
    it("scopes to own username for non-superuser", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: false }) // isSuperUser check
        .mockResolvedValueOnce({ username: "john" }); // resolveUsername
      await viewResignations(
        makeReq({ query: { username: "other" } }),
        makeRes(),
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "listResignations",
        expect.objectContaining({ username: "john" }),
      );
    });

    it("allows superuser to view any user's resignation", async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ isSuperUser: true })
        .mockResolvedValueOnce({ username: "admin" });
      await viewResignations(
        makeReq({ query: { username: "jane" } }),
        makeRes(),
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "listResignations",
        expect.objectContaining({ username: "jane" }),
      );
    });
  });

  it("approveResignation calls approveResignation with params id", async () => {
    await approveResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "approveResignation",
      expect.objectContaining({ id: "res-1" }),
    );
  });

  it("rejectResignation calls rejectResignation with params id", async () => {
    await rejectResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "rejectResignation",
      expect.objectContaining({ id: "res-1" }),
    );
  });

  it("withdrawResignation calls rejectResignation with Withdrawn status", async () => {
    await withdrawResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      "rejectResignation",
      expect.objectContaining({ id: "res-1", status: "Withdrawn" }),
    );
  });

  describe("jobOpeningsInsights", () => {
    it("returns overview with counts", async () => {
      mockJobCount
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(6) // open
        .mockResolvedValueOnce(3); // closed
      mockJobGroupBy.mockResolvedValue([{ status: "Open", _count: { id: 6 } }]);
      const res = makeRes();
      await jobOpeningsInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ total: 10, open: 6 }),
        }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockJobCount.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await jobOpeningsInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("scheduleInterview", () => {
    it("returns NOT_FOUND when application not found", async () => {
      mockAppFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await scheduleInterview(makeReq({ body: { _id: "app-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("pushes interview and updates status", async () => {
      mockAppFindUnique.mockResolvedValue({ id: "app-1", interviews: [] });
      mockAppUpdate.mockResolvedValue({});
      const res = makeRes();
      await scheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 1,
            interviewDateTime: "2024-04-01",
            interviewer: "Alice",
          },
        }),
        res,
      );
      expect(mockAppUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "app-1" },
          data: expect.objectContaining({ status: "Round 1 Scheduled" }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("reassignInterviewer", () => {
    it("returns NOT_FOUND when application not found", async () => {
      mockAppFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await reassignInterviewer(makeReq({ body: { _id: "app-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when round not found", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [{ roundNumber: 2 }],
      });
      const res = makeRes();
      await reassignInterviewer(
        makeReq({
          body: { _id: "app-1", interviewRound: 1, interviewer: "Bob" },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates interviewer for correct round", async () => {
      const interview = { roundNumber: 1, interviewer: "Alice" };
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [interview],
      });
      mockAppUpdate.mockResolvedValue({});
      await reassignInterviewer(
        makeReq({
          body: { _id: "app-1", interviewRound: 1, interviewer: "Bob" },
        }),
        makeRes(),
      );
      expect(interview.interviewer).toBe("Bob");
    });
  });

  describe("getInterviewerList", () => {
    it("returns users with HR or Manager roles", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: "u1",
          username: "alice",
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@test.com",
        },
      ]);
      const res = makeRes();
      await getInterviewerList(makeReq(), res);
      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ role: { has: "HR" } }, { role: { has: "Manager" } }],
          },
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("updateResignation", () => {
    it("returns NOT_FOUND when resignation not found", async () => {
      mockResignFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await updateResignation(
        makeReq({ params: { _id: "res-99" }, body: {} }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates assetsReturned field", async () => {
      mockResignFindUnique.mockResolvedValue({ id: "res-1" });
      mockResignUpdate.mockResolvedValue({ id: "res-1" });
      await updateResignation(
        makeReq({
          params: { _id: "res-1" },
          body: { status: "Assets Returned", value: true },
        }),
        makeRes(),
      );
      expect(mockResignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assetsReturned: true }),
        }),
      );
    });
  });

  describe("resignationInsights", () => {
    it("returns resignation counts and approval rate", async () => {
      mockResignCount
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // submitted
        .mockResolvedValueOnce(5) // approved
        .mockResolvedValueOnce(2) // rejected
        .mockResolvedValueOnce(0); // withdrawn
      mockResignFindMany.mockResolvedValue([]);
      const res = makeRes();
      await resignationInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({ total: 10, approved: 5 }),
          }),
        }),
      );
    });
  });
});
