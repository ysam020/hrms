import { prisma } from "@hrms/db";
import { removeFcmToken } from "../handlers/removeFcmToken";

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

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const token1 = {
  token: "tok-1",
  deviceFingerprint: "fp-1",
  lastUsed: new Date(),
  isActive: true,
};
const token2 = {
  token: "tok-2",
  deviceFingerprint: "fp-2",
  lastUsed: new Date(),
  isActive: true,
};
const baseUser = { id: "u1", fcmTokens: [token1, token2] };

describe("removeFcmToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...baseUser, fcmTokens: [] });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await removeFcmToken(
      makeCall({ userId: "u-99", deviceFingerprint: "fp-1" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when neither deviceFingerprint nor disableAll provided", async () => {
    mockFindUnique.mockResolvedValue({ ...baseUser });
    const cb = makeCallback();
    await removeFcmToken(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("removes all tokens when disableAll=true", async () => {
    mockFindUnique.mockResolvedValue({ ...baseUser });
    const cb = makeCallback();
    await removeFcmToken(makeCall({ userId: "u1", disableAll: true }), cb);
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(0);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        removedCount: 2,
        remainingDevices: 0,
      }),
    );
  });

  it("returns NOT_FOUND when fingerprint not found in tokens", async () => {
    mockFindUnique.mockResolvedValue({ ...baseUser });
    const cb = makeCallback();
    await removeFcmToken(
      makeCall({ userId: "u1", deviceFingerprint: "fp-unknown" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("removes specific token by fingerprint", async () => {
    mockFindUnique.mockResolvedValue({ ...baseUser });
    mockUpdate.mockResolvedValue({ ...baseUser, fcmTokens: [token2] });
    const cb = makeCallback();
    await removeFcmToken(
      makeCall({ userId: "u1", deviceFingerprint: "fp-1" }),
      cb,
    );
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(1);
    expect(updatedTokens[0].deviceFingerprint).toBe("fp-2");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        removedCount: 1,
        remainingDevices: 1,
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await removeFcmToken(
      makeCall({ userId: "u1", deviceFingerprint: "fp-1" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
