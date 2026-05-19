import { prisma } from "@hrms/db";
import { registerFcmToken } from "../handlers/registerFcmToken";

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

const baseUser = { id: "u1", fcmTokens: [] };

describe("registerFcmToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...baseUser });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await registerFcmToken(
      makeCall({ userId: "u-99", token: "tok", deviceFingerprint: "fp" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("adds new token when no existing token for fingerprint", async () => {
    mockFindUnique.mockResolvedValue({ ...baseUser, fcmTokens: [] });
    const cb = makeCallback();
    await registerFcmToken(
      makeCall({
        userId: "u1",
        token: "new-token",
        deviceFingerprint: "fp-1",
        browser: "Chrome",
        os: "MacOS",
        deviceType: "desktop",
        ipAddress: "1.2.3.4",
      }),
      cb,
    );
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(1);
    expect(updatedTokens[0].token).toBe("new-token");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, activeDevices: 1 }),
    );
  });

  it("updates existing token when fingerprint matches", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseUser,
      fcmTokens: [
        {
          token: "old-token",
          deviceFingerprint: "fp-1",
          lastUsed: new Date(),
          isActive: true,
        },
      ],
    });
    const cb = makeCallback();
    await registerFcmToken(
      makeCall({
        userId: "u1",
        token: "updated-token",
        deviceFingerprint: "fp-1",
      }),
      cb,
    );
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(1);
    expect(updatedTokens[0].token).toBe("updated-token");
  });

  it("caps tokens at 15 by removing oldest", async () => {
    const many = Array.from({ length: 16 }, (_, i) => ({
      token: `tok-${i}`,
      deviceFingerprint: `fp-${i}`,
      lastUsed: new Date(2024, 0, i + 1),
      isActive: true,
    }));
    mockFindUnique.mockResolvedValue({ ...baseUser, fcmTokens: many });
    const cb = makeCallback();
    await registerFcmToken(
      makeCall({ userId: "u1", token: "new", deviceFingerprint: "fp-new" }),
      cb,
    );
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(15);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await registerFcmToken(makeCall({ userId: "u1", token: "tok" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
