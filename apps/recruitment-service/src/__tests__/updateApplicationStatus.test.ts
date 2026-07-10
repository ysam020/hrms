import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateApplicationStatus } from "../handlers/updateApplicationStatus";

jest.mock("@hrms/db", () => {
  const _db = {
    jobApplication: { findUnique: jest.fn(), update: jest.fn() },
    jobOpening: { update: jest.fn() },
    user: { findMany: jest.fn() },
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
  getNotificationQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { getNotificationQueue } from "@hrms/queue";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).jobApplication.findUnique as jest.Mock;
const mockUpdate = (prisma as any).jobApplication.update as jest.Mock;
const mockJobOpeningUpdate = (prisma as any).jobOpening.update as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockGetNotificationQueue = getNotificationQueue as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const application = {
  id: "app-1",
  name: "John Doe",
  status: "Applied",
  jobTitleId: "j-1",
};

// Hiring requires at least one round Completed + Cleared — most non-Hired-
// specific tests below don't care about this precondition, so they use this
// fixture to stay unaffected by that guard.
const applicationWithClearedRound = {
  ...application,
  interviews: [
    {
      roundNumber: 1,
      interviewer: "Alice",
      interviewConducted: true,
      cleared: true,
      feedback: "Great fit.",
    },
  ],
};

describe("updateApplicationStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...application, status: "Shortlisted" });
    mockJobOpeningUpdate.mockResolvedValue(undefined);
    mockUserFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateApplicationStatus(makeCall({ status: "Shortlisted" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when status is missing", async () => {
    const cb = makeCallback();
    await updateApplicationStatus(makeCall({ id: "app-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
  });

  it("returns NOT_FOUND when application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-99", status: "Shortlisted" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("updates application status and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(application);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Shortlisted" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "Shortlisted" },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:applications:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("increments candidatesHired when status is Hired", async () => {
    mockFindUnique.mockResolvedValue(applicationWithClearedRound);
    mockUpdate.mockResolvedValue({ ...application, status: "Hired" });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Hired" }),
      cb,
    );
    expect(mockJobOpeningUpdate).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: { candidatesHired: { increment: 1 } },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:jobOpenings:*");
  });

  it("persists remarks when provided", async () => {
    mockFindUnique.mockResolvedValue(application);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Rejected", remarks: "Not a fit" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "Rejected", remarks: "Not a fit" },
    });
  });

  it("persists hire details when status is Hired", async () => {
    mockFindUnique.mockResolvedValue(applicationWithClearedRound);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Hired",
        salary: "1200000",
        joiningDate: "2026-08-01",
        referenceBy: "Jane Smith",
      }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: {
        status: "Hired",
        hireSalary: 1200000,
        hireJoiningDate: new Date("2026-08-01"),
        hireReferredBy: "Jane Smith",
      },
    });
  });

  it("ignores hire detail fields when status is not Hired", async () => {
    mockFindUnique.mockResolvedValue(application);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Shortlisted", salary: "1200000" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "Shortlisted" },
    });
  });

  it("rejects hiring when no interview round has ever been scheduled", async () => {
    mockFindUnique.mockResolvedValue(application); // no interviews array at all
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Hired" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }), // FAILED_PRECONDITION
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockJobOpeningUpdate).not.toHaveBeenCalled();
  });

  it("rejects hiring when a round was Completed but never Cleared", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        {
          roundNumber: 1,
          interviewer: "Alice",
          interviewConducted: true,
          feedback: "Good",
          // no `cleared` — Completed, but the outcome was never formalized.
        },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Hired" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }), // FAILED_PRECONDITION
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows hiring once at least one round has been Completed and Cleared", async () => {
    mockFindUnique.mockResolvedValue(applicationWithClearedRound);
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Hired" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "Hired" },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("marks the matching round conducted and stores feedback when status is a round Completed", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        { roundNumber: 1, interviewer: "Alice", interviewConducted: false },
        { roundNumber: 2, interviewer: "Bob", interviewConducted: false },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 2 Completed",
        interviewRound: 2,
        interviewFeedback: "Great communication, solid fundamentals.",
      }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.interviews).toEqual([
      { roundNumber: 1, interviewer: "Alice", interviewConducted: false },
      {
        roundNumber: 2,
        interviewer: "Bob",
        interviewConducted: true,
        feedback: "Great communication, solid fundamentals.",
      },
    ]);
  });

  it("clears an already-Completed round without requiring feedback and without touching the stored feedback", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        {
          roundNumber: 1,
          interviewer: "Alice",
          interviewConducted: true,
          feedback: "Great communication, solid fundamentals.",
        },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Round 1 Cleared", interviewRound: 1 }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: {
        status: "Round 1 Cleared",
        interviews: [
          {
            roundNumber: 1,
            interviewer: "Alice",
            interviewConducted: true,
            feedback: "Great communication, solid fundamentals.",
            cleared: true,
          },
        ],
      },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("rejects re-marking an already-Completed round as Completed again", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        {
          roundNumber: 1,
          interviewer: "Alice",
          interviewConducted: true,
          feedback: "Already given.",
        },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 1 Completed",
        interviewRound: 1,
        interviewFeedback: "Trying again.",
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }), // FAILED_PRECONDITION
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects Clearing a round that hasn't been marked Completed yet", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        { roundNumber: 1, interviewer: "Alice", interviewConducted: false },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Round 1 Cleared", interviewRound: 1 }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }), // FAILED_PRECONDITION
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects marking a round Completed without feedback", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        { roundNumber: 1, interviewer: "Alice", interviewConducted: false },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 1 Completed",
        interviewRound: 1,
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }), // INVALID_ARGUMENT
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects marking a round Completed with blank/whitespace-only feedback", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        { roundNumber: 1, interviewer: "Alice", interviewConducted: false },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 1 Completed",
        interviewRound: 1,
        interviewFeedback: "   ",
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects marking a round Completed before its scheduled interview has ended", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        {
          roundNumber: 1,
          interviewer: "Alice",
          interviewConducted: false,
          // Fixed far-future date — always "not yet ended" regardless of
          // when this test suite runs.
          interviewStartTime: "20991231T150000",
          interviewEndTime: "20991231T160000",
        },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 1 Completed",
        interviewRound: 1,
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }), // FAILED_PRECONDITION
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows marking a round Completed once its scheduled interview has ended", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [
        {
          roundNumber: 1,
          interviewer: "Alice",
          interviewConducted: false,
          interviewStartTime: "20200101T150000",
          interviewEndTime: "20200101T160000",
        },
      ],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({
        id: "app-1",
        status: "Round 1 Completed",
        interviewRound: 1,
        interviewFeedback: "Cleared with good marks.",
      }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("does not touch interviews when interviewRound doesn't match any round", async () => {
    mockFindUnique.mockResolvedValue({
      ...application,
      interviews: [{ roundNumber: 1, interviewConducted: false }],
    });
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Round 2 Cleared", interviewRound: 2 }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.interviews).toBeUndefined();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Shortlisted" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });

  it("enqueues notification when HR users exist", async () => {
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockGetNotificationQueue.mockReturnValueOnce(mockQueue);

    mockFindUnique.mockResolvedValue(application);
    mockUpdate.mockResolvedValue({ ...application, status: "Shortlisted" });
    mockUserFindMany.mockResolvedValue([{ id: "u1", username: "hr1" }]);

    await updateApplicationStatus(
      makeCall({ id: "app-1", status: "Shortlisted" }),
      makeCallback(),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueue.add).toHaveBeenCalledWith(
      "applicationStatusUpdated",
      expect.any(Object),
    );
  });
});
