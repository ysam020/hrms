import { prisma } from "@hrms/db";
import { webAuthnAuthenticationVerify } from "../handlers/webAuthnAuthenticationVerify";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    tenantMembership: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

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
