import { prisma } from "@hrms/db";
import { webAuthnAuthenticationOptions } from "../handlers/webAuthnAuthenticationOptions";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findFirst: jest.fn() },
  },
}));

jest.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: jest.fn().mockResolvedValue({
    challenge: "test-challenge",
    allowCredentials: [],
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

const mockFindFirst = (prisma as any).user.findFirst as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("webAuthnAuthenticationOptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await webAuthnAuthenticationOptions(makeCall({ username: "unknown" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns NOT_FOUND when user has no credentials", async () => {
    mockFindFirst.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      webAuthnCredentials: null,
    });
    const cb = makeCallback();
    await webAuthnAuthenticationOptions(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("generates authentication options and stores challenge", async () => {
    mockFindFirst.mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      webAuthnCredentials: [{ credentialID: "cred-1" }],
    });
    const cb = makeCallback();
    await webAuthnAuthenticationOptions(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, options: expect.any(String) }),
    );
  });

  it("returns INTERNAL on error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await webAuthnAuthenticationOptions(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
