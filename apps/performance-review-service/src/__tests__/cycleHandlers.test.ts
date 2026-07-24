import { status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  getTenantId,
  getAuditActor,
} from "@hrms/db";
import { createCycle } from "../handlers/createCycle";
import { updateCycle } from "../handlers/updateCycle";
import { updateCycleStatus } from "../handlers/updateCycleStatus";
import { getCycle } from "../handlers/getCycle";
import { listCycles } from "../handlers/listCycles";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    performanceReviewCycle: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    performanceReview: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    team: { findFirst: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return {
    prismaWithTenant: _db,
    prisma: _db,
    getTenantId: jest.fn(() => "t1"),
    getAuditActor: jest.fn(() => ({ userId: "hr1" })),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

const db: any = prisma;
const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

describe("createCycle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when name/period fields are missing", async () => {
    const cb = makeCallback();
    await createCycle(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NAME_PERIOD_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
    expect(db.performanceReviewCycle.create).not.toHaveBeenCalled();
  });

  it("creates the cycle and a draft review per employee, resolving each reviewer", async () => {
    db.performanceReviewCycle.create.mockResolvedValue({
      id: "c1",
      name: "H1 2026",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-06-30"),
      status: "active",
      ratingScale: 5,
      createdBy: "hr1",
      createdAt: new Date(),
    });
    db.team.findFirst.mockResolvedValue({ teamLeaderId: "mgr1" });
    db.performanceReview.create.mockResolvedValue({});
    const cb = makeCallback();

    await createCycle(
      makeCall({
        name: "H1 2026",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        userIds: ["u1", "u2"],
      }),
      cb,
    );

    expect(db.performanceReviewCycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        name: "H1 2026",
        status: "active",
        createdBy: "hr1",
      }),
    });
    expect(db.performanceReview.create).toHaveBeenCalledTimes(2);
    expect(db.performanceReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cycleId: "c1",
        userId: "u1",
        reviewerId: "mgr1",
        status: "draft",
      }),
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.CYCLE_CREATED,
        status: status.OK,
      }),
    );
  });

  it("continues creating remaining reviews when one employee's review creation fails", async () => {
    db.performanceReviewCycle.create.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.team.findFirst.mockResolvedValue(null);
    db.performanceReview.create
      .mockRejectedValueOnce(new Error("bad userId"))
      .mockResolvedValueOnce({});
    const cb = makeCallback();

    await createCycle(
      makeCall({
        name: "H1 2026",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        userIds: ["bad-user", "u2"],
      }),
      cb,
    );

    expect(db.performanceReview.create).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: status.OK,
        message: MESSAGES.CYCLE_CREATED,
      }),
    );
  });

  it("defaults ratingScale to 5 and tolerates a missing userIds list", async () => {
    db.performanceReviewCycle.create.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    const cb = makeCallback();

    await createCycle(
      makeCall({
        name: "H1 2026",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
      }),
      cb,
    );

    expect(db.performanceReviewCycle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ratingScale: 5 }),
    });
    expect(db.performanceReview.create).not.toHaveBeenCalled();
  });

  it("returns INTERNAL on a database error", async () => {
    db.performanceReviewCycle.create.mockRejectedValue(new Error("db down"));
    const cb = makeCallback();
    await createCycle(
      makeCall({
        name: "H1 2026",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});

describe("updateCycle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateCycle(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.CYCLE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND for a missing cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateCycle(makeCall({ id: "c1", name: "New name" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.CYCLE_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("returns NOT_FOUND for a soft-deleted cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "deleted",
    });
    const cb = makeCallback();
    await updateCycle(makeCall({ id: "c1", name: "New name" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("only patches fields present in the request", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "active",
      createdBy: "hr1",
    });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findMany.mockResolvedValue([]);
    const cb = makeCallback();

    await updateCycle(makeCall({ id: "c1", name: "Renamed" }), cb);

    expect(db.performanceReviewCycle.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });

  it("self-heals a review with no reviewerId by re-resolving it", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "active",
      createdBy: "hr1",
    });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findMany.mockResolvedValue([
      { id: "r1", userId: "u1", reviewerId: null, status: "draft" },
    ]);
    db.team.findFirst.mockResolvedValue({ teamLeaderId: "mgr1" });
    db.performanceReview.update.mockResolvedValue({});
    const cb = makeCallback();

    await updateCycle(makeCall({ id: "c1" }), cb);

    expect(db.performanceReview.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { reviewerId: "mgr1" },
    });
  });

  it("does not touch membership when userIds is omitted", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "active",
      createdBy: "hr1",
    });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findMany.mockResolvedValue([
      { id: "r1", userId: "u1", reviewerId: "mgr1", status: "draft" },
    ]);
    const cb = makeCallback();

    await updateCycle(makeCall({ id: "c1", name: "X" }), cb);

    expect(db.performanceReview.create).not.toHaveBeenCalled();
    expect(db.performanceReview.deleteMany).not.toHaveBeenCalled();
  });

  it("adds new reviews and drops removed draft-only reviews when userIds is provided", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "active",
      createdBy: "hr1",
    });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findMany.mockResolvedValue([
      { id: "r1", userId: "u1", reviewerId: "mgr1", status: "draft" }, // will be removed
      { id: "r2", userId: "u2", reviewerId: "mgr1", status: "draft" }, // stays
    ]);
    db.team.findFirst.mockResolvedValue({ teamLeaderId: "mgr2" });
    db.performanceReview.create.mockResolvedValue({});
    db.performanceReview.deleteMany.mockResolvedValue({});
    const cb = makeCallback();

    await updateCycle(makeCall({ id: "c1", userIds: ["u2", "u3"] }), cb);

    expect(db.performanceReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u3", reviewerId: "mgr2" }),
    });
    expect(db.performanceReview.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1"] } },
    });
  });

  it("preserves a review that's progressed past draft even if unchecked from the cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      status: "active",
      createdBy: "hr1",
    });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findMany.mockResolvedValue([
      {
        id: "r1",
        userId: "u1",
        reviewerId: "mgr1",
        status: "self_assessment_submitted",
      },
    ]);
    const cb = makeCallback();

    await updateCycle(makeCall({ id: "c1", userIds: [] }), cb);

    expect(db.performanceReview.deleteMany).not.toHaveBeenCalled();
  });
});

describe("updateCycleStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT for a missing id", async () => {
    const cb = makeCallback();
    await updateCycleStatus(makeCall({ status: "closed" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns INVALID_ARGUMENT for a disallowed status value", async () => {
    const cb = makeCallback();
    await updateCycleStatus(makeCall({ id: "c1", status: "bogus" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns NOT_FOUND for a missing cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateCycleStatus(makeCall({ id: "c1", status: "closed" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("updates the cycle status on the happy path", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({ id: "c1" });
    db.performanceReviewCycle.update.mockResolvedValue({
      id: "c1",
      status: "closed",
      createdAt: new Date(),
    });
    const cb = makeCallback();
    await updateCycleStatus(makeCall({ id: "c1", status: "closed" }), cb);
    expect(db.performanceReviewCycle.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "closed" },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });
});

describe("getCycle", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT for a missing id", async () => {
    const cb = makeCallback();
    await getCycle(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.INVALID_ARGUMENT }),
    );
  });

  it("returns NOT_FOUND for a missing cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getCycle(makeCall({ id: "c1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.NOT_FOUND }),
    );
  });

  it("returns the cycle without an enrollment check when no requesterId is set (privileged caller)", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    const cb = makeCallback();
    await getCycle(makeCall({ id: "c1" }), cb);
    expect(db.performanceReview.findFirst).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("denies a non-privileged requester who isn't enrolled in the cycle", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getCycle(makeCall({ id: "c1", requesterId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.FORBIDDEN,
      status: status.PERMISSION_DENIED,
    });
  });

  it("allows an enrolled requester (reviewee or reviewer)", async () => {
    db.performanceReviewCycle.findUnique.mockResolvedValue({
      id: "c1",
      createdAt: new Date(),
    });
    db.performanceReview.findFirst.mockResolvedValue({ id: "r1" });
    const cb = makeCallback();
    await getCycle(makeCall({ id: "c1", requesterId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });
});

describe("listCycles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.performanceReviewCycle.findMany.mockResolvedValue([]);
    db.performanceReviewCycle.count.mockResolvedValue(0);
  });

  it("excludes deleted cycles by default", async () => {
    const cb = makeCallback();
    await listCycles(makeCall({}), cb);
    expect(db.performanceReviewCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "deleted" } }),
      }),
    );
  });

  it("filters by an explicit status", async () => {
    const cb = makeCallback();
    await listCycles(makeCall({ status: "closed" }), cb);
    expect(db.performanceReviewCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "closed" }),
      }),
    );
  });

  it("restricts to enrolled cycles when requesterId is set", async () => {
    const cb = makeCallback();
    await listCycles(makeCall({ requesterId: "u1" }), cb);
    expect(db.performanceReviewCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviews: { some: { OR: [{ userId: "u1" }, { reviewerId: "u1" }] } },
        }),
      }),
    );
  });

  it("returns an empty page with total 0 on a database error", async () => {
    db.performanceReviewCycle.findMany.mockRejectedValue(new Error("db down"));
    const cb = makeCallback();
    await listCycles(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  });
});
