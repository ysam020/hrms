import { status } from "@grpc/grpc-js";
import { refreshToken } from "../handlers/refreshToken";
import { MESSAGES } from "../constants/messages";

jest.mock("../services/jwt", () => ({
  verifyRefreshToken: jest.fn(),
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

jest.mock("../services/redis", () => ({
  validateRefreshToken: jest.fn(),
  storeRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import {
  validateRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
} from "../services/redis";

const mockVerifyRefreshToken = verifyRefreshToken as jest.Mock;
const mockSignAccessToken = signAccessToken as jest.Mock;
const mockSignRefreshToken = signRefreshToken as jest.Mock;
const mockValidateRefreshToken = validateRefreshToken as jest.Mock;
const mockStoreRefreshToken = storeRefreshToken as jest.Mock;
const mockRevokeRefreshToken = revokeRefreshToken as jest.Mock;

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
    expect(mockValidateRefreshToken).not.toHaveBeenCalled();
  });

  it("returns UNAUTHENTICATED when token is valid but revoked in Redis", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    mockValidateRefreshToken.mockResolvedValue({ ok: false });

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "revoked-token" }), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.REFRESH_TOKEN_REVOKED,
      status: status.UNAUTHENTICATED,
      accessToken: "",
      refreshToken: "",
    });
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
  });

  it("rotates tokens and returns new pair on happy path", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    mockValidateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "valid-token",
    });
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockSignAccessToken.mockReturnValue("new-access-token");
    mockSignRefreshToken.mockReturnValue("new-refresh-token");
    mockStoreRefreshToken.mockResolvedValue(undefined);

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "valid-token" }), cb);

    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1");
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(mockSignRefreshToken).toHaveBeenCalledWith("user-1");
    expect(mockStoreRefreshToken).toHaveBeenCalledWith(
      "user-1",
      "new-refresh-token",
      undefined,
      undefined,
      "valid-token",
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("re-serves current token without rotating during grace period retry", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-1" });
    // currentToken differs from the incoming token — this is the grace-period case
    mockValidateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "already-rotated-token",
    });
    mockSignAccessToken.mockReturnValue("new-access-token");

    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old-token" }), cb);

    // Must NOT rotate again
    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expect(mockSignRefreshToken).not.toHaveBeenCalled();
    expect(mockStoreRefreshToken).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: "new-access-token",
      refreshToken: "already-rotated-token",
    });
  });

  it("validates token with correct userId extracted from payload", async () => {
    mockVerifyRefreshToken.mockReturnValue({ userId: "user-42" });
    mockValidateRefreshToken.mockResolvedValue({
      ok: true,
      currentToken: "valid-token",
    });
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockSignAccessToken.mockReturnValue("at");
    mockSignRefreshToken.mockReturnValue("rt");
    mockStoreRefreshToken.mockResolvedValue(undefined);

    await refreshToken(
      makeCall({ refreshToken: "valid-token" }),
      makeCallback(),
    );

    expect(mockValidateRefreshToken).toHaveBeenCalledWith(
      "user-42",
      "valid-token",
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
