import { status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { instantiateApproval } from "@hrms/approval-engine";
import { submitSelfAssessment } from "../handlers/submitSelfAssessment";
import { submitManagerReview } from "../handlers/submitManagerReview";
import { finalizeReview } from "../handlers/finalizeReview";
import { getReview } from "../handlers/getReview";
import { listReviews } from "../handlers/listReviews";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prismaWithTenant: {
    performanceReview: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    performanceReviewCycle: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
  getTenantId: jest.fn(() => "t1"),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/approval-engine", () => ({
  instantiateApproval: jest.fn(),
}));

const db: any = prisma;
const mockInstantiateApproval = instantiateApproval as jest.Mock;
const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

describe("submitSelfAssessment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when reviewId is missing", async () => {
    const cb = makeCallback();
    await submitSelfAssessment(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.REVIEW_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND for a missing review", async () => {
    db.performanceReview.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await submitSelfAssessment(makeCall({ reviewId: "r1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.REVIEW_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("records the self-assessment and stamps submittedAt", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      createdAt: new Date(),
    });
    const cb = makeCallback();

    await submitSelfAssessment(
      makeCall({ reviewId: "r1", selfComments: "Did well", selfRating: "4.5" }),
      cb,
    );

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({
        selfComments: "Did well",
        selfRating: 4.5,
        status: "self_assessment_submitted",
        submittedAt: expect.any(Date),
      }),
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("defaults an unparseable selfRating to 0", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      createdAt: new Date(),
    });
    const cb = makeCallback();
    await submitSelfAssessment(
      makeCall({ reviewId: "r1", selfRating: "not-a-number" }),
      cb,
    );
    expect(db.performanceReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ selfRating: 0 }),
      }),
    );
  });
});

describe("submitManagerReview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when reviewId is missing", async () => {
    const cb = makeCallback();
    await submitManagerReview(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns NOT_FOUND for a missing review", async () => {
    db.performanceReview.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await submitManagerReview(makeCall({ reviewId: "r1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("records the manager review and kicks off the approval-engine instance", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      userId: "u1",
      overallRating: 4,
      recommendedIncrementPct: 10,
      createdAt: new Date(),
    });
    mockInstantiateApproval.mockResolvedValue({});
    const cb = makeCallback();

    await submitManagerReview(
      makeCall({
        reviewId: "r1",
        managerComments: "Solid quarter",
        managerRating: "4",
        overallRating: "4",
        recommendedIncrementPct: "10",
        effectiveFrom: "2026-07-01",
      }),
      cb,
    );

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({
        managerRating: 4,
        overallRating: 4,
        recommendedIncrementPct: 10,
        status: "manager_review_submitted",
      }),
    });
    expect(mockInstantiateApproval).toHaveBeenCalledWith(
      "t1",
      "performance_review",
      "r1",
      "u1",
      expect.objectContaining({
        overallRating: 4,
        recommendedIncrementPct: 10,
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("stores a null recommendedIncrementPct/effectiveFrom when not provided", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      userId: "u1",
      createdAt: new Date(),
    });
    mockInstantiateApproval.mockResolvedValue({});
    const cb = makeCallback();

    await submitManagerReview(
      makeCall({ reviewId: "r1", managerRating: "3" }),
      cb,
    );

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({
        recommendedIncrementPct: null,
        effectiveFrom: null,
      }),
    });
  });

  it("does not instantiate an approval when there is no tenant context", async () => {
    (getTenantId as jest.Mock).mockReturnValueOnce(undefined);
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      userId: "u1",
      createdAt: new Date(),
    });
    const cb = makeCallback();

    await submitManagerReview(makeCall({ reviewId: "r1" }), cb);

    expect(mockInstantiateApproval).not.toHaveBeenCalled();
  });
});

describe("finalizeReview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await finalizeReview(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns NOT_FOUND for a missing review", async () => {
    db.performanceReview.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await finalizeReview(makeCall({ id: "r1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("marks the review approved and stores the salary structure id", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      createdAt: new Date(),
    });
    const cb = makeCallback();

    await finalizeReview(
      makeCall({ id: "r1", approved: true, salaryStructureId: "ss1" }),
      cb,
    );

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({
        status: "approved",
        salaryStructureId: "ss1",
        finalizedAt: expect.any(Date),
      }),
    });
  });

  it("marks the review rejected with a null salary structure id", async () => {
    db.performanceReview.findUnique.mockResolvedValue({ id: "r1" });
    db.performanceReview.update.mockResolvedValue({
      id: "r1",
      createdAt: new Date(),
    });
    const cb = makeCallback();

    await finalizeReview(makeCall({ id: "r1", approved: false }), cb);

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({
        status: "rejected",
        salaryStructureId: null,
      }),
    });
  });
});

describe("getReview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getReview(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns NOT_FOUND for a missing review", async () => {
    db.performanceReview.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getReview(makeCall({ id: "r1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("returns the review on success", async () => {
    db.performanceReview.findUnique.mockResolvedValue({
      id: "r1",
      createdAt: new Date(),
    });
    const cb = makeCallback();
    await getReview(makeCall({ id: "r1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: status.OK,
        message: MESSAGES.REVIEW_FETCHED,
      }),
    );
  });
});

describe("listReviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.performanceReview.findMany.mockResolvedValue([]);
    db.performanceReview.count.mockResolvedValue(0);
  });

  it("filters by cycleId, userId, and reviewerId when provided", async () => {
    const cb = makeCallback();
    await listReviews(
      makeCall({ cycleId: "c1", userId: "u1", reviewerId: "mgr1" }),
      cb,
    );
    expect(db.performanceReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cycleId: "c1",
          userId: "u1",
          reviewerId: "mgr1",
        }),
      }),
    );
  });

  it('ignores a status filter of "all"', async () => {
    const cb = makeCallback();
    await listReviews(makeCall({ status: "All" }), cb);
    expect(db.performanceReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it("resolves a search term against matching users and cycles", async () => {
    db.user.findMany.mockResolvedValue([{ id: "u2" }]);
    db.performanceReviewCycle.findMany.mockResolvedValue([{ id: "c2" }]);
    const cb = makeCallback();

    await listReviews(makeCall({ search: "jane" }), cb);

    expect(db.performanceReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: { in: ["u2"] } }, { cycleId: { in: ["c2"] } }],
        }),
      }),
    );
  });

  it("does not paginate when no positive limit is passed", async () => {
    const cb = makeCallback();
    await listReviews(makeCall({}), cb);
    const callArgs = db.performanceReview.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
  });

  it("paginates when a positive limit is passed", async () => {
    const cb = makeCallback();
    await listReviews(makeCall({ limit: "10", page: "2" }), cb);
    expect(db.performanceReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("returns an empty page with total 0 on a database error", async () => {
    db.performanceReview.findMany.mockRejectedValue(new Error("db down"));
    const cb = makeCallback();
    await listReviews(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  });
});
