import { prisma } from "@hrms/db";
import { recruitment } from "@hrms/proto";
import {
  viewJobOpenings,
  viewJobOpening,
  addJobOpening,
  editJobOpening,
  deleteJobOpening,
  publicCareers,
  publicJobOpening,
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
  rescheduleInterview,
  reassignInterviewer,
  getInterviewerList,
  updateResignation,
  addExitFeedback,
  resignationInsights,
} from "../handlers/recruitment";

jest.mock("../grpc/clients", () => ({
  recruitmentClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("../handlers/approvalChains", () => ({
  actOnApprovalForEntity: jest.fn(),
  isPrivileged: jest.fn().mockResolvedValue(false),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    jobOpening: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
    jobApplication: {
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    resignation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    tenantSettings: { findFirst: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CREATED: 201,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { actOnApprovalForEntity } from "../handlers/approvalChains";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockActOnApprovalForEntity = actOnApprovalForEntity as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockJobCount = (prisma as any).jobOpening.count as jest.Mock;
const mockJobGroupBy = (prisma as any).jobOpening.groupBy as jest.Mock;
const mockJobFindMany = (prisma as any).jobOpening.findMany as jest.Mock;
const mockAppFindUnique = (prisma as any).jobApplication
  .findUnique as jest.Mock;
const mockAppUpdate = (prisma as any).jobApplication.update as jest.Mock;
const mockAppGroupBy = (prisma as any).jobApplication.groupBy as jest.Mock;
const mockResignFindUnique = (prisma as any).resignation
  .findUnique as jest.Mock;
const mockResignUpdate = (prisma as any).resignation.update as jest.Mock;
const mockResignCount = (prisma as any).resignation.count as jest.Mock;
const mockResignFindMany = (prisma as any).resignation.findMany as jest.Mock;
const mockResignFindFirst = (prisma as any).resignation.findFirst as jest.Mock;
const mockTenantSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1", tenantId: "t1", tenantRole: "member" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("recruitmentHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
    mockActOnApprovalForEntity.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    mockTenantSettingsFindFirst.mockResolvedValue({ maxInterviewRounds: 5 });
    mockUserFindUnique.mockResolvedValue({
      username: "admin",
      isSuperUser: false,
    });
    mockUserFindMany.mockResolvedValue([]);
    mockJobCount.mockResolvedValue(5);
    mockJobGroupBy.mockResolvedValue([]);
    mockJobFindMany.mockResolvedValue([]);
    mockAppGroupBy.mockResolvedValue([]);
    mockResignCount.mockResolvedValue(0);
    mockResignFindMany.mockResolvedValue([]);
  });

  it("viewJobOpenings calls listJobOpenings", async () => {
    await viewJobOpenings(makeReq({ query: { status: "Open" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Open" }),
    );
  });

  it("viewJobOpening calls getJobOpening with id", async () => {
    await viewJobOpening(makeReq({ params: { id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
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
      expect.anything(),
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
      expect.anything(),
      "updateJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
  });

  it("deleteJobOpening calls deleteJobOpening with params id", async () => {
    await deleteJobOpening(makeReq({ params: { _id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "deleteJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
  });

  it("publicCareers defaults to jobStatus Active (matches real status values — 'Open' never existed)", async () => {
    await publicCareers(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Active" }),
    );
  });

  it("publicCareers honors an explicit ?status= query param", async () => {
    await publicCareers(makeReq({ query: { status: "Expired" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Expired" }),
    );
  });

  it("publicJobOpening returns the job when it's Active", async () => {
    mockGrpcCall.mockResolvedValue({
      data: { id: "j-1", jobTitle: "SWE", status: "Active" },
    });
    const res = makeRes();
    await publicJobOpening(makeReq({ params: { id: "j-1" } }), res);
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getJobOpening",
      expect.objectContaining({ id: "j-1" }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("publicJobOpening returns NOT_FOUND for a non-Active job (expired/deleted) even with a valid id", async () => {
    mockGrpcCall.mockResolvedValue({
      data: { id: "j-1", jobTitle: "SWE", status: "Expired" },
    });
    const res = makeRes();
    await publicJobOpening(makeReq({ params: { id: "j-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
  });

  it("getJobTitles calls listJobOpenings with large limit", async () => {
    await getJobTitles(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "listJobOpenings",
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("applyForJob calls applyForJob with body data", async () => {
    await applyForJob(
      makeReq({ body: { jobTitleId: "j-1", name: "Jane Doe" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "applyForJob",
      expect.objectContaining({ jobTitleId: "j-1" }),
    );
  });

  it("viewApplications calls listApplications with jobTitleId", async () => {
    await viewApplications(makeReq({ params: { id: "j-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
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
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Shortlisted" }),
    );
  });

  it("updateCandidateStatus forwards interviewRound", async () => {
    await updateCandidateStatus(
      makeReq({
        body: {
          id: "app-1",
          status: "Round 2 Cleared",
          interviewRound: 2,
        },
      }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({
        id: "app-1",
        status: "Round 2 Cleared",
        interviewRound: 2,
      }),
    );
  });

  it("updateCandidateStatus forwards feedback as interviewFeedback", async () => {
    await updateCandidateStatus(
      makeReq({
        body: {
          id: "app-1",
          status: "Round 1 Cleared",
          interviewRound: 1,
          feedback: "Strong on system design, weak on coding.",
        },
      }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({
        interviewFeedback: "Strong on system design, weak on coding.",
      }),
    );
  });

  it("updateCandidateStatus builds a request that encodes cleanly (regression: 'Request message serialization failure: invalid float32: undefined')", async () => {
    // Reproduces the exact payload from the reported failing curl request —
    // marking Round 1 Completed from InfoModal's Update Status action.
    await updateCandidateStatus(
      makeReq({
        body: {
          status: "Round 1 Completed",
          jobTitle: "DEVELOPMENT MANAGER",
          name: "Sameer Yadav",
          aadharNo: "454782322514",
          interviewRound: 1,
          id: "6a507077edd8734d982be106",
        },
      }),
      makeRes(),
    );
    const sentRequest = mockGrpcCall.mock.calls[0][2];
    expect(() =>
      recruitment.UpdateStatusRequest.encode(sentRequest).finish(),
    ).not.toThrow();
  });

  it("hireCandidate calls updateApplicationStatus with Hired status", async () => {
    await hireCandidate(makeReq({ body: { id: "app-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Hired" }),
    );
  });

  it("hireCandidate forwards salary/joining_date/reference_by as hire details", async () => {
    await hireCandidate(
      makeReq({
        body: {
          id: "app-1",
          salary: 1200000,
          joining_date: "2026-08-01",
          reference_by: "Jane Smith",
        },
      }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({
        id: "app-1",
        status: "Hired",
        salary: "1200000",
        joiningDate: "2026-08-01",
        referenceBy: "Jane Smith",
      }),
    );
  });

  it("rejectApplication calls updateApplicationStatus with Rejected status", async () => {
    await rejectApplication(makeReq({ body: { id: "app-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Rejected" }),
    );
  });

  it("rejectApplication forwards the frontend's 'reason' field as remarks", async () => {
    await rejectApplication(
      makeReq({ body: { id: "app-1", reason: "Not a fit" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({
        id: "app-1",
        status: "Rejected",
        remarks: "Not a fit",
      }),
    );
  });

  it("hireCandidate and rejectApplication build requests that encode cleanly", async () => {
    await hireCandidate(makeReq({ body: { id: "app-1" } }), makeRes());
    await rejectApplication(makeReq({ body: { id: "app-1" } }), makeRes());
    for (const call of mockGrpcCall.mock.calls) {
      expect(() =>
        recruitment.UpdateStatusRequest.encode(call[2]).finish(),
      ).not.toThrow();
    }
  });

  it("addResignation calls submitResignation with user's userId", async () => {
    await addResignation(
      makeReq({ body: { reason: "Better opportunity" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "submitResignation",
      expect.objectContaining({
        userId: "user-1",
        reason: "Better opportunity",
      }),
    );
  });

  describe("viewResignations", () => {
    it("scopes to own userId for non-superuser", async () => {
      mockUserFindUnique.mockResolvedValueOnce({ isSuperUser: false });
      await viewResignations(
        makeReq({ query: { userId: "other" } }),
        makeRes(),
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "listResignations",
        expect.objectContaining({ userId: "user-1" }),
      );
    });

    it("allows superuser to view any user's resignation", async () => {
      mockUserFindUnique.mockResolvedValueOnce({ isSuperUser: true });
      await viewResignations(makeReq({ query: { userId: "jane" } }), makeRes());
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "listResignations",
        expect.objectContaining({ userId: "jane" }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await viewResignations(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  it("approveResignation acts on the pending approval instance via the Approval Chain", async () => {
    await approveResignation(
      makeReq({ params: { _id: "res-1" }, body: { comments: "ok" } }),
      makeRes(),
    );
    expect(mockActOnApprovalForEntity).toHaveBeenCalledWith(
      "t1",
      "resignation",
      "res-1",
      "user-1",
      "approved",
      "ok",
      false,
      expect.objectContaining({}),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("approveResignation returns BAD_REQUEST when actOnApprovalForEntity rejects with a plain message", async () => {
    mockActOnApprovalForEntity.mockRejectedValue(
      new Error("You are not the approver for this request."),
    );
    const res = makeRes();
    await approveResignation(makeReq({ params: { _id: "res-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.objectContaining({
        message: "You are not the approver for this request.",
      }),
    );
  });

  it("rejectResignation acts on the pending approval instance via the Approval Chain", async () => {
    await rejectResignation(
      makeReq({
        params: { _id: "res-1" },
        body: { rejectionReason: "not a fit" },
      }),
      makeRes(),
    );
    expect(mockActOnApprovalForEntity).toHaveBeenCalledWith(
      "t1",
      "resignation",
      "res-1",
      "user-1",
      "rejected",
      undefined,
      false,
      expect.objectContaining({ rejectionReason: "not a fit" }),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("rejectResignation returns BAD_REQUEST when actOnApprovalForEntity rejects with a plain message", async () => {
    mockActOnApprovalForEntity.mockRejectedValue(
      new Error("No pending approval found for this resignation request."),
    );
    const res = makeRes();
    await rejectResignation(makeReq({ params: { _id: "res-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.any(Object),
    );
  });

  it("withdrawResignation calls the withdrawResignation RPC (not rejectResignation)", async () => {
    // Previously this called rejectResignation with status: "Withdrawn",
    // which that handler silently ignored and always recorded as
    // "Rejected" — withdrawResignation is the real, dedicated RPC.
    mockResignFindUnique.mockResolvedValue({ userId: "user-1" });
    await withdrawResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "withdrawResignation",
      expect.objectContaining({ id: "res-1" }),
    );
  });

  it("withdrawResignation returns INTERNAL on error", async () => {
    mockResignFindUnique.mockResolvedValue({ userId: "user-1" });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await withdrawResignation(makeReq({ params: { _id: "res-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  describe("jobOpeningsInsights", () => {
    const makeJob = (overrides: any = {}) => ({
      id: "job-1",
      jobTitle: "Engineer",
      status: "Active",
      experience: 3,
      budget: [10, 15],
      applicationDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      hiringManager: "Alice",
      candidatesHired: 1,
      jobPostingDate: new Date(),
      deletedOn: null,
      _count: { applications: 5 },
      ...overrides,
    });

    it("returns overview with counts", async () => {
      mockJobFindMany.mockResolvedValue([
        makeJob({ id: "job-1", status: "Active", _count: { applications: 5 } }),
        makeJob({ id: "job-2", status: "Open", _count: { applications: 3 } }),
      ]);
      mockAppGroupBy.mockResolvedValue([
        { status: "Applied", _count: { id: 6 } },
        { status: "Hired", _count: { id: 1 } },
      ]);
      const res = makeRes();
      await jobOpeningsInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({
              totalJobOpenings: 2,
              activeJobOpenings: 2,
              totalApplications: 7,
            }),
          }),
        }),
      );
    });

    it("excludes Expired/Deleted jobs from overdueJobs but counts a past-deadline Active job", async () => {
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockJobFindMany.mockResolvedValue([
        makeJob({
          id: "job-1",
          status: "Active",
          applicationDeadline: pastDeadline,
        }),
        makeJob({
          id: "job-2",
          status: "Expired",
          applicationDeadline: pastDeadline,
        }),
      ]);
      mockAppGroupBy.mockResolvedValue([]);
      const res = makeRes();
      await jobOpeningsInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            deadlines: expect.objectContaining({ overdueJobs: 1 }),
          }),
        }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockJobFindMany.mockRejectedValue(new Error("DB error"));
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

    it("returns INTERNAL on error", async () => {
      mockAppFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await scheduleInterview(makeReq({ body: { _id: "app-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("updates the existing round in place instead of appending a duplicate", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [{ roundNumber: 1, interviewer: "Alice" }],
      });
      mockAppUpdate.mockResolvedValue({});
      const res = makeRes();
      await scheduleInterview(
        makeReq({
          body: { _id: "app-1", roundNumber: 1, interviewer: "Carol" },
        }),
        res,
      );
      const updateData = mockAppUpdate.mock.calls[0][0].data;
      expect(updateData.interviews).toHaveLength(1);
      expect(updateData.interviews[0]).toEqual(
        expect.objectContaining({ roundNumber: 1, interviewer: "Carol" }),
      );
    });

    it("rejects scheduling a round that starts before the previous round ends", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [
          {
            roundNumber: 1,
            interviewStartTime: "20260625T150000",
            interviewEndTime: "20260625T160000",
          },
        ],
      });
      const res = makeRes();
      await scheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 2,
            interviewStartTime: "20260625T153000",
            interviewEndTime: "20260625T163000",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppUpdate).not.toHaveBeenCalled();
    });

    it("allows scheduling a round that starts after the previous round ends", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [
          {
            roundNumber: 1,
            interviewStartTime: "20260625T150000",
            interviewEndTime: "20260625T160000",
          },
        ],
      });
      mockAppUpdate.mockResolvedValue({});
      const res = makeRes();
      await scheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 2,
            interviewStartTime: "20260626T100000",
            interviewEndTime: "20260626T110000",
          },
        }),
        res,
      );
      expect(mockAppUpdate).toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("rejects scheduling a round past the tenant's configured max interview rounds", async () => {
      mockTenantSettingsFindFirst.mockResolvedValue({ maxInterviewRounds: 2 });
      mockAppFindUnique.mockResolvedValue({ id: "app-1", interviews: [] });
      const res = makeRes();
      await scheduleInterview(
        makeReq({ body: { _id: "app-1", roundNumber: 3 } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppUpdate).not.toHaveBeenCalled();
    });

    it("falls back to the default max rounds when the tenant has no settings row", async () => {
      mockTenantSettingsFindFirst.mockResolvedValue(null);
      mockAppFindUnique.mockResolvedValue({ id: "app-1", interviews: [] });
      const res = makeRes();
      await scheduleInterview(
        makeReq({ body: { _id: "app-1", roundNumber: 6 } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppUpdate).not.toHaveBeenCalled();
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

    it("returns INTERNAL on error", async () => {
      mockAppFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await reassignInterviewer(makeReq({ body: { _id: "app-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getInterviewerList", () => {
    it("queries superusers or users holding the JobOpenings:take_interview permission", async () => {
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
            OR: [
              { isSuperUser: true },
              { permissions: { has: "JobOpenings:take_interview" } },
            ],
          },
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockUserFindMany.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getInterviewerList(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
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

    it("updates fnfDone field when status is FnF Done", async () => {
      mockResignFindUnique.mockResolvedValue({ id: "res-1" });
      mockResignUpdate.mockResolvedValue({ id: "res-1" });
      await updateResignation(
        makeReq({
          params: { _id: "res-1" },
          body: { status: "FnF Done", value: true },
        }),
        makeRes(),
      );
      expect(mockResignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fnfDone: true }),
        }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockResignFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await updateResignation(
        makeReq({ params: { _id: "res-1" }, body: {} }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
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

    it("returns INTERNAL on error", async () => {
      mockResignCount.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await resignationInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("rescheduleInterview", () => {
    it("returns BAD_REQUEST when roundNumber is missing", async () => {
      const res = makeRes();
      await rescheduleInterview(makeReq({ body: { _id: "app-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppFindUnique).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when application not found", async () => {
      mockAppFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await rescheduleInterview(
        makeReq({ body: { _id: "app-99", roundNumber: 1 } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("updates the existing round in place instead of appending a duplicate", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [{ roundNumber: 1, interviewer: "Alice" }],
      });
      mockAppUpdate.mockResolvedValue({});
      const res = makeRes();
      await rescheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 1,
            interviewer: "Bob",
          },
        }),
        res,
      );
      const updateData = mockAppUpdate.mock.calls[0][0].data;
      expect(updateData.interviews).toHaveLength(1);
      expect(updateData.interviews[0]).toEqual(
        expect.objectContaining({ roundNumber: 1, interviewer: "Bob" }),
      );
    });

    it("returns BAD_REQUEST and does not touch the round when it has already been conducted", async () => {
      // Regression: rescheduling always targets the latest round number.
      // Once Round 1 is marked Completed/Cleared (interviewConducted:
      // true), attempting to reschedule it must be rejected instead of
      // silently flipping interviewConducted back to false.
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [
          { roundNumber: 1, interviewer: "Alice", interviewConducted: true },
        ],
      });
      const res = makeRes();
      await rescheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 1,
            interviewer: "Bob",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppUpdate).not.toHaveBeenCalled();
    });

    it("rejects rescheduling a round to start before the previous round ends", async () => {
      mockAppFindUnique.mockResolvedValue({
        id: "app-1",
        interviews: [
          {
            roundNumber: 1,
            interviewStartTime: "20260625T150000",
            interviewEndTime: "20260625T160000",
          },
          { roundNumber: 2, interviewer: "Bob" },
        ],
      });
      const res = makeRes();
      await rescheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 2,
            interviewStartTime: "20260625T153000",
            interviewEndTime: "20260625T163000",
          },
        }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
      expect(mockAppUpdate).not.toHaveBeenCalled();
    });

    it("pushes rescheduled interview and updates status", async () => {
      mockAppFindUnique.mockResolvedValue({ id: "app-1", interviews: [] });
      mockAppUpdate.mockResolvedValue({});
      const res = makeRes();
      await rescheduleInterview(
        makeReq({
          body: {
            _id: "app-1",
            roundNumber: 2,
            interviewStartTime: "10:00",
            interviewEndTime: "11:00",
            interviewer: "Bob",
          },
        }),
        res,
      );
      expect(mockAppUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "app-1" },
          data: expect.objectContaining({ status: "Round 2 Rescheduled" }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockAppFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await rescheduleInterview(
        makeReq({ body: { _id: "app-1", roundNumber: 1 } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("addExitFeedback", () => {
    it("returns BAD_REQUEST when no approved resignation exists", async () => {
      mockResignFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await addExitFeedback(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.objectContaining({
          message: expect.stringContaining("approved resignation"),
        }),
      );
    });

    it("returns BAD_REQUEST when feedback already submitted", async () => {
      mockResignFindFirst.mockResolvedValue({
        id: "res-1",
        status: "Approved",
        overallJobSatisfaction: 4,
      });
      const res = makeRes();
      await addExitFeedback(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.objectContaining({
          message: expect.stringContaining("already been submitted"),
        }),
      );
    });

    it("saves exit feedback and returns CREATED", async () => {
      mockResignFindFirst.mockResolvedValue({
        id: "res-1",
        status: "Approved",
        overallJobSatisfaction: 0,
      });
      mockResignUpdate.mockResolvedValue({ id: "res-1" });
      const res = makeRes();
      await addExitFeedback(
        makeReq({
          body: {
            overall_job_satisfaction: 4,
            quality_of_communication: "Good",
            support_from_manager: "Excellent",
            suggestions: "Better onboarding",
          },
        }),
        res,
      );
      expect(mockResignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "res-1" },
          data: expect.objectContaining({ overallJobSatisfaction: 4 }),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.CREATED,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockResignFindFirst.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await addExitFeedback(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
