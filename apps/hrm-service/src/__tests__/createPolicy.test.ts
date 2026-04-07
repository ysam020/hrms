import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { createPolicy } from "../handlers/createPolicy";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    policy: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindFirst = (prisma as any).policy.findFirst as jest.Mock;
const mockCreate = (prisma as any).policy.create as jest.Mock;
const mockUpdate = (prisma as any).policy.update as jest.Mock;

describe("createPolicy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when policyType is missing", async () => {
    const cb = makeCallback();
    await createPolicy(makeCall({ content: "Some content" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.POLICY_TYPE_CONTENT_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when content is missing", async () => {
    const cb = makeCallback();
    await createPolicy(makeCall({ policyType: "Leave" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.POLICY_TYPE_CONTENT_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("creates new policy when none exists for this policyType", async () => {
    mockFindFirst.mockResolvedValue(null);
    const newPolicy = {
      id: "pol-1",
      policyType: "Leave",
      content: "You get 12 days per year",
    };
    mockCreate.mockResolvedValue(newPolicy);

    const cb = makeCallback();
    await createPolicy(
      makeCall({
        policyType: "Leave",
        content: "You get 12 days per year",
        createdBy: "admin",
      }),
      cb,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyType: "Leave",
          content: "You get 12 days per year",
          status: "active",
          createdBy: "admin",
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.POLICY_CREATED,
      status: status.OK,
      data: newPolicy,
    });
  });

  it("updates existing policy (upsert) when one already exists", async () => {
    const existing = {
      id: "pol-1",
      policyType: "Leave",
      policyName: "Leave Policy",
    };
    mockFindFirst.mockResolvedValue(existing);
    const updated = { ...existing, content: "Updated content" };
    mockUpdate.mockResolvedValue(updated);

    const cb = makeCallback();
    await createPolicy(
      makeCall({
        policyType: "Leave",
        content: "Updated content",
        createdBy: "admin",
      }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "pol-1" },
      data: expect.objectContaining({
        content: "Updated content",
        lastUpdatedBy: "admin",
        lastUpdatedOn: expect.any(Date),
      }),
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.POLICY_UPDATED,
      status: status.OK,
      data: updated,
    });
  });

  it("queries with policyName for 'Other' policyType", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "pol-1" });

    await createPolicy(
      makeCall({
        policyType: "Other",
        policyName: "Custom Policy",
        content: "Some content",
      }),
      makeCallback(),
    );

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        policyType: "Other",
        policyName: "Custom Policy",
      }),
    });
  });

  it("does not include policyName in query for non-Other policyTypes", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "pol-1" });

    await createPolicy(
      makeCall({ policyType: "Leave", content: "content" }),
      makeCallback(),
    );

    const queryArgs = mockFindFirst.mock.calls[0][0];
    expect(queryArgs.where).not.toHaveProperty("policyName");
  });

  it("skips deleted policies in the lookup (status not 'deleted')", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "pol-1" });

    await createPolicy(
      makeCall({ policyType: "Leave", content: "content" }),
      makeCallback(),
    );

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "deleted" } }),
      }),
    );
  });

  it("defaults policyName to policyType when creating new policy", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "pol-1" });

    await createPolicy(
      makeCall({ policyType: "Leave", content: "content" }),
      makeCallback(),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyName: "Leave" }),
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await createPolicy(
      makeCall({ policyType: "Leave", content: "content" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
