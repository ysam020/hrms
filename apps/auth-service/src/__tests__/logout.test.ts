import { logout } from "../handlers/logout";

jest.mock("../services/redis", () => ({
  revokeRefreshToken: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { revokeRefreshToken } from "../services/redis";
const mockRevoke = revokeRefreshToken as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("logout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevoke.mockResolvedValue(undefined);
  });

  it("revokes refresh token and returns OK", async () => {
    const cb = makeCallback();
    await logout(makeCall({ userId: "u1" }), cb);
    expect(mockRevoke).toHaveBeenCalledWith("u1");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on error", async () => {
    mockRevoke.mockRejectedValue(new Error("Redis error"));
    const cb = makeCallback();
    await logout(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
