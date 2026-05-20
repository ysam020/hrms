import { prisma } from "@hrms/db";
import { webAuthnRegistrationVerify } from "../handlers/webAuthnRegistrationVerify";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: jest.fn(),
}));

jest.mock("../services/redis", () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getRedisClient } from "../services/redis";

const mockVerify = verifyRegistrationResponse as jest.Mock;
const mockRedisGet = jest.fn();
const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const credential = JSON.stringify({
  id: "cred-1",
  rawId: "cred-1",
  type: "public-key",
  response: {
    clientDataJSON: "data",
    attestationObject: "attest",
    transports: ["internal"],
  },
  clientExtensionResults: {},
});

describe("webAuthnRegistrationVerify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue({
      get: mockRedisGet,
      del: jest.fn(),
    });
    mockUpdate.mockResolvedValue({ id: "u1" });
  });

  it("returns FAILED_PRECONDITION when challenge has expired", async () => {
    mockRedisGet.mockResolvedValue(null);
    const cb = makeCallback();
    await webAuthnRegistrationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("returns UNAUTHENTICATED when verification fails", async () => {
    mockRedisGet.mockResolvedValue("test-challenge");
    mockVerify.mockResolvedValue({ verified: false, registrationInfo: null });
    const cb = makeCallback();
    await webAuthnRegistrationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 16 }),
    );
  });

  it("saves new credential on successful verification", async () => {
    mockRedisGet.mockResolvedValue("test-challenge");
    mockFindUnique.mockResolvedValue({ id: "u1", webAuthnCredentials: [] });
    mockVerify.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialID: Buffer.from("cred-1"),
        credentialPublicKey: Buffer.from("pubkey"),
        counter: 0,
      },
    });
    const cb = makeCallback();
    await webAuthnRegistrationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          webAuthnCredentials: expect.any(Array),
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on error", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis error"));
    const cb = makeCallback();
    await webAuthnRegistrationVerify(
      makeCall({ userId: "u1", credential }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
