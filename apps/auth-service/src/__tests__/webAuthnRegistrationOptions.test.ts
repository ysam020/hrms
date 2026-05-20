import { prisma } from "@hrms/db";
import { webAuthnRegistrationOptions } from "../handlers/webAuthnRegistrationOptions";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: jest.fn().mockResolvedValue({
    challenge: "test-challenge",
    rp: { id: "localhost", name: "HRMS" },
  }),
}));

jest.mock("../services/redis", () => ({
  getRedisClient: jest.fn(() => ({
    setex: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("webAuthnRegistrationOptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await webAuthnRegistrationOptions(
      makeCall({ userId: "u-99", email: "test@test.com" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("generates registration options and stores challenge", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", email: "user@test.com" });
    const cb = makeCallback();
    await webAuthnRegistrationOptions(
      makeCall({ userId: "u1", email: "user@test.com" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, options: expect.any(String) }),
    );
  });

  it("returns INTERNAL on error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await webAuthnRegistrationOptions(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
