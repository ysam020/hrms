import { status } from "@grpc/grpc-js";
import { refreshToken } from "../handlers/refreshToken";
import { MESSAGES } from "../constants/messages";

jest.mock("../services/jwt", () => ({
  verifyRefreshToken: jest.fn(),
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

jest.mock("../services/redis", () => ({
  rotateRefreshToken: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import { rotateRefreshToken } from "../services/redis";

const mockVerifyRefreshToken = verifyRefreshToken as jest.Mock;
const mockSignAccessToken = signAccessToken as jest.Mock;
const mockSignRefreshToken = signRefreshToken as jest.Mock;
const mockRotateRefreshToken = rotateRefreshToken as jest.Mock;

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

describe("refreshToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns UNAUTHENTICATED when token is invalid (fails verification)", async () => {
    mockVerifyRefreshToken.mockReturnValue(null);

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "bad-token" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INVALID_REFRESH_TOKEN,
      status: status.UNAUTHENTICATED,
      accessToken: "",
      refreshToken: "",
    });
    expect(mockRotateRefreshToken).not.toHaveBeenCalled();
  });

  it("returns UNAUTHENTICATED when token is valid but revoked in Redis", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    mockRotateRefreshToken.mockResolvedValue({ ok: false });

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "revoked-token" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.REFRESH_TOKEN_REVOKED,
      status: status.UNAUTHENTICATED,
      accessToken: "",
      refreshToken: "",
    });
  });

  it("rotates tokens and returns new pair on happy path", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    mockSignRefreshToken.mockReturnValue("new-refresh-token");
    mockRotateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "new-refresh-token",
      tenantId: null,
      tenantRole: null,
      dbName: null,
      orgSetupComplete: true,
    });
    mockSignAccessToken.mockReturnValue("new-access-token");

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "valid-token" }), cb);

    expect(mockSignRefreshToken).toHaveBeenCalledWith("user-1");
    expect(mockRotateRefreshToken).toHaveBeenCalledWith(
      "user-1",
      "valid-token",
      "new-refresh-token",
    );
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("re-serves the winning token when this request lost the rotation race", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    mockSignRefreshToken.mockReturnValue("discarded-candidate-token");
    // rotateRefreshToken's currentToken differs from our candidate — another
    // concurrent request won the atomic rotation; ours was never persisted.
    mockRotateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "already-rotated-token",
      tenantId: null,
      tenantRole: null,
      dbName: null,
      orgSetupComplete: true,
    });
    mockSignAccessToken.mockReturnValue("new-access-token");

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old-token" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: "new-access-token",
      refreshToken: "already-rotated-token",
    });
  });

  it("calls rotateRefreshToken with the correct userId extracted from payload", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-42" });
    mockSignRefreshToken.mockReturnValue("new-refresh-token");
    mockRotateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "new-refresh-token",
      tenantId: null,
      tenantRole: null,
      dbName: null,
      orgSetupComplete: true,
    });
    mockSignAccessToken.mockReturnValue("at");

    await refreshToken(
      makeCall({ refreshToken: "valid-token" }),
      makeCallback(),
    );

    expect(mockRotateRefreshToken).toHaveBeenCalledWith(
      "user-42",
      "valid-token",
      "new-refresh-token",
    );
  });

  it("returns INTERNAL on unexpected error", async () => {
    mockVerifyRefreshToken.mockImplementation(() => {
      throw new Error("Unexpected error");
    });

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "any-token" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
      refreshToken: "",
    });
  });
});
