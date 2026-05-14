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

jest.mock("@hrms/db", () => ({
  prisma: {
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
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
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

  it("publicCareers calls listJobOpenings with status Open", async () => {
    await publicCareers(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "listJobOpenings",
      expect.objectContaining({ jobStatus: "Open" }),
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

  it("hireCandidate calls updateApplicationStatus with Hired status", async () => {
    await hireCandidate(makeReq({ body: { id: "app-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateApplicationStatus",
      expect.objectContaining({ id: "app-1", status: "Hired" }),
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

  it("approveResignation calls approveResignation with params id", async () => {
    await approveResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "approveResignation",
      expect.objectContaining({ id: "res-1" }),
    );
  });

  it("approveResignation returns INTERNAL on error", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await approveResignation(makeReq({ params: { _id: "res-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("rejectResignation calls rejectResignation with params id", async () => {
    await rejectResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "rejectResignation",
      expect.objectContaining({ id: "res-1" }),
    );
  });

  it("rejectResignation returns INTERNAL on error", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await rejectResignation(makeReq({ params: { _id: "res-1" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("withdrawResignation calls rejectResignation with Withdrawn status", async () => {
    mockResignFindUnique.mockResolvedValue({ userId: "user-1" });
    await withdrawResignation(makeReq({ params: { _id: "res-1" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "rejectResignation",
      expect.objectContaining({ id: "res-1", status: "Withdrawn" }),
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
    it("returns NOT_FOUND when application not found", async () => {
      mockAppFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await rescheduleInterview(makeReq({ body: { _id: "app-99" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
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
            interviewDateTime: "2024-04-10",
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
      await rescheduleInterview(makeReq({ body: { _id: "app-1" } }), res);
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
