import { prisma } from "@hrms/db";
import { webAuthnAuthenticationVerify } from "../handlers/webAuthnAuthenticationVerify";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    tenantMembership: { findFirst: jest.fn(), create: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    // The real status rule, and the shared account check
    // (allowed by default; denial has its own tests below).
    isBlockedEmployeeStatus: (s: string) =>
      ["Terminated", "Absconded", "Resigned"].includes(s),
    checkAccountAccess: (...a: unknown[]) => mockCheckAccountAccess(...a),
  };
});
const mockCheckAccountAccess = jest.fn();

jest.mock("@simplewebauthn/server", () => ({
  verifyAuthenticationResponse: jest.fn(),
}));

jest.mock("../services/jwt", () => ({
  signAccessToken: jest.fn().mockReturnValue("access-token"),
  signRefreshToken: jest.fn().mockReturnValue("refresh-token"),
}));

jest.mock("../services/redis", () => ({
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getRedisClient } from "../services/redis";

const mockVerify = verifyAuthenticationResponse as jest.Mock;
const mockRedisGet = jest.fn();
const mockFindFirst = (prisma as any).user.findFirst as jest.Mock;
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockMembershipFindFirst = (prisma as any).tenantMembership
  .findFirst as jest.Mock;
const mockMembershipCreate = (prisma as any).tenantMembership
  .create as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const credential = JSON.stringify({
  id: "cred-1",
  rawId: "cred-1",
  type: "public-key",
  response: {
    clientDataJSON: "data",
    authenticatorData: "authdata",
    signature: "sig",
  },
  clientExtensionResults: {},
});

const user = {
  id: "u1",
  email: "user@test.com",
  webAuthnCredentials: [
    {
      credentialID: "cred-1",
      publicKey: Buffer.from("pubkey").toString("base64"),
      counter: 0,
      transports: [],
    },
  ],
};

describe("webAuthnAuthenticationVerify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue({
      get: mockRedisGet,
      del: jest.fn(),
    });
    mockUpdate.mockResolvedValue(user);
    mockMembershipFindFirst.mockResolvedValue({ tenantId: "t1", role: "HR" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "db-t1" });
    mockCheckAccountAccess.mockResolvedValue({
      ok: true,
      tenantRole: "HR",
      dbName: "db-t1",
      employeeStatus: "Active",
    });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION when challenge has expired", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockRedisGet.mockResolvedValue(null);
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("returns NOT_FOUND when credential ID not found in stored credentials", async () => {
    mockFindUnique.mockResolvedValue({
      ...user,
      webAuthnCredentials: [{ credentialID: "other-cred" }],
    });
    mockRedisGet.mockResolvedValue("challenge");
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns OK with tokens on successful verification", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockRedisGet.mockResolvedValue("test-challenge");
    mockVerify.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, accessToken: "access-token" }),
    );
  });

  it("self-heals a missing TenantMembership when user.tenantId is already stamped", async () => {
    mockFindUnique.mockResolvedValue({ ...user, tenantId: "t1" });
    mockRedisGet.mockResolvedValue("test-challenge");
    mockVerify.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    mockMembershipFindFirst.mockResolvedValue(null); // membership row missing
    mockTenantFindUnique.mockResolvedValue({
      id: "t1",
      isActive: true,
      dbName: "db-t1",
    });
    mockMembershipCreate.mockResolvedValue({
      tenantId: "t1",
      userId: "u1",
      role: "employee",
    });
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(mockMembershipCreate).toHaveBeenCalledWith({
      data: { tenantId: "t1", userId: "u1", role: "employee" },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, accessToken: "access-token" }),
    );
  });

  it("clears a stale user.tenantId that points at a deleted/inactive tenant", async () => {
    mockFindUnique.mockResolvedValue({ ...user, tenantId: "gone" });
    mockRedisGet.mockResolvedValue("test-challenge");
    mockVerify.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    mockMembershipFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValueOnce(null);
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(mockMembershipCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { tenantId: null },
    });
  });

  it("returns INTERNAL on error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});

describe("webAuthnAuthenticationVerify — passkeys follow the same access rules", () => {
  const { storeRefreshToken } = jest.requireMock("../services/redis");
  const { signAccessToken } = jest.requireMock("../services/jwt");
  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue({
      get: mockRedisGet,
      del: jest.fn(),
    });
    mockRedisGet.mockResolvedValue("test-challenge");
    mockVerify.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    mockUpdate.mockResolvedValue(user);
    mockMembershipFindFirst.mockResolvedValue({ tenantId: "t1", role: "HR" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "db-t1" });
    mockCheckAccountAccess.mockResolvedValue({
      ok: true,
      tenantRole: "HR",
      dbName: "db-t1",
      employeeStatus: "Active",
    });
  });

  it.each(["Terminated", "Absconded", "Resigned"])(
    "refuses a %s employee who presents a VALID passkey — no tokens issued",
    async (employeeStatus) => {
      mockFindUnique.mockResolvedValue({ ...user, employeeStatus });
      const cb = makeCallback();
      await webAuthnAuthenticationVerify(
        makeCall({ userId: "u1", credential }),
        cb,
      );
      expect(cb).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ status: 7, accessToken: "" }), // PERMISSION_DENIED
      );
      expect(signAccessToken).not.toHaveBeenCalled();
      expect(storeRefreshToken).not.toHaveBeenCalled();
    },
  );

  it("refuses when the organisation was deactivated", async () => {
    mockFindUnique.mockResolvedValue({ ...user, employeeStatus: "Active" });
    mockCheckAccountAccess.mockResolvedValue({
      ok: false,
      reason: "tenant_inactive",
    });
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 7, accessToken: "" }),
    );
    expect(storeRefreshToken).not.toHaveBeenCalled();
  });

  it("still signs in an active employee", async () => {
    mockFindUnique.mockResolvedValue({ ...user, employeeStatus: "Active" });
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, accessToken: "access-token" }),
    );
  });

  it("does not reveal a blocked status to someone whose assertion fails", async () => {
    mockFindUnique.mockResolvedValue({ ...user, employeeStatus: "Terminated" });
    mockVerify.mockResolvedValue({ verified: false });
    const cb = makeCallback();
    await webAuthnAuthenticationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 16 }), // UNAUTHENTICATED, same as any bad assertion
    );
  });
});
