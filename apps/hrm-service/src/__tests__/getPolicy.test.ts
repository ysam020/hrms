import { prisma } from "@hrms/db";
import { getPolicy } from "../handlers/getPolicy";

jest.mock("@hrms/db", () => {
  const _db = {
    policy: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).policy.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const policy = { id: "p-1", policyName: "Leave Policy", status: "active" };

describe("getPolicy", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getPolicy(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when policy does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getPolicy(makeCall({ id: "p-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns NOT_FOUND for deleted policy", async () => {
    mockFindUnique.mockResolvedValue({ ...policy, status: "deleted" });
    const cb = makeCallback();
    await getPolicy(makeCall({ id: "p-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns policy data on success", async () => {
    mockFindUnique.mockResolvedValue(policy);
    const cb = makeCallback();
    await getPolicy(makeCall({ id: "p-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: policy }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getPolicy(makeCall({ id: "p-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
