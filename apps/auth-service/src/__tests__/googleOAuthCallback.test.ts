import { prisma } from "@hrms/db";
import { googleOAuthCallback } from "../handlers/googleOAuthCallback";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    tenantMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    tenantInvite: { findFirst: jest.fn(), updateMany: jest.fn() },
    tenant: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("../services/jwt", () => ({
  signAccessToken: jest.fn().mockReturnValue("access-token"),
  signRefreshToken: jest.fn().mockReturnValue("refresh-token"),
}));

jest.mock("../services/redis", () => ({
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindFirst = (prisma as any).user.findFirst as jest.Mock;
const mockCreate = (prisma as any).user.create as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;
const mockCount = (prisma as any).user.count as jest.Mock;
const mockMembershipFindMany = (prisma as any).tenantMembership
  .findMany as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const activeUser = {
  id: "u1",
  email: "user@test.com",
  username: "user",
  role: ["HR"],
  first_name: "User",
  last_name: "Name",
  employeeStatus: "Active",
};

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockTokenExchange(ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    json: async () => ({ access_token: "google-access-token" }),
    text: async () => "error",
  });
}

function mockProfileFetch(
  ok = true,
  profile = { email: "user@test.com", name: "User Name", picture: null },
) {
  mockFetch.mockResolvedValueOnce({
    ok,
    json: async () => profile,
  });
}

describe("googleOAuthCallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(1); // not first user
    mockMembershipFindMany.mockResolvedValue([{ tenantId: "t1", role: "HR" }]);
    mockUserUpdate.mockResolvedValue({ ...activeUser, tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "db-t1" });
  });

  it("returns INVALID_ARGUMENT when code is missing", async () => {
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
  });

  it("returns UNAUTHENTICATED when token exchange fails", async () => {
    mockTokenExchange(false);
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 16 }),
    );
  });

  it("returns UNAUTHENTICATED when profile fetch fails", async () => {
    mockTokenExchange(true);
    mockProfileFetch(false);
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 16 }),
    );
  });

  it("returns PERMISSION_DENIED for terminated user", async () => {
    mockTokenExchange();
    mockProfileFetch(true, {
      email: "user@test.com",
      name: "User",
      picture: null,
    });
    mockFindFirst.mockResolvedValue({
      ...activeUser,
      employeeStatus: "Terminated",
    });
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 7 }),
    );
  });

  it("logs in existing active user and returns tokens", async () => {
    mockTokenExchange();
    mockProfileFetch();
    mockFindFirst.mockResolvedValue(activeUser);
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it("auto-registers new user when not found", async () => {
    mockTokenExchange();
    mockProfileFetch();
    // First call for finding existing user: null. Second call for checking unique username: null.
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValue(null);
    mockCreate.mockResolvedValue(activeUser);
    mockMembershipFindMany.mockResolvedValue([]); // new user has no memberships yet
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(mockCreate).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on unexpected error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const cb = makeCallback();
    await googleOAuthCallback(makeCall({ code: "auth-code" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
