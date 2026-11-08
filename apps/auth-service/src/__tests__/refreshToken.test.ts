import { status } from "@grpc/grpc-js";
import { refreshToken } from "../handlers/refreshToken";
import { MESSAGES } from "../constants/messages";

jest.mock("../services/jwt", () => ({
  verifyRefreshToken: jest.fn(),
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

jest.mock("../services/redis", () => ({
  // Read-only peek before rotation. Default: the presented token is
  // current, no organisation (the tenantless cases below).
  peekRefreshToken: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

// Renewal re-checks the person against the DB.
// Default: allowed, no organisation (what the tenantless cases below use).
const mockCheckAccountAccess = jest.fn();
jest.mock("@hrms/db", () => ({
  checkAccountAccess: (...a: unknown[]) => mockCheckAccountAccess(...a),
  isAccountAccessUnavailable: (e: unknown) =>
    (e as { name?: string })?.name === "AccountAccessUnavailableError",
}));
const unavailableErr = (kind: "timeout" | "error") =>
  Object.assign(new Error(`account access check ${kind}`), {
    name: "AccountAccessUnavailableError",
    kind,
  });

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import {
  peekRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../services/redis";
const mockPeek = peekRefreshToken as jest.Mock;

const mockVerifyRefreshToken = verifyRefreshToken as jest.Mock;
const mockSignAccessToken = signAccessToken as jest.Mock;
const mockSignRefreshToken = signRefreshToken as jest.Mock;
const mockRotateRefreshToken = rotateRefreshToken as jest.Mock;

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

describe("refreshToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPeek.mockResolvedValue({ state: "current", tenantId: null });
    mockCheckAccountAccess.mockResolvedValue({
      ok: true,
      tenantRole: null,
      dbName: null,
      employeeStatus: "Active",
    });
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
      expect.objectContaining({ redisMs: expect.any(Number) }),
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
      expect.objectContaining({ redisMs: expect.any(Number) }),
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

describe("refreshToken — renewal re-checks the person", () => {
  const rotated = (meta: Record<string, unknown>) => ({
    ok: true,
    currentToken: "new-refresh",
    tenantId: "t1",
    tenantRole: "owner",
    dbName: "db-snapshot",
    orgSetupComplete: true,
    ...meta,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyRefreshToken.mockReturnValue({ userId: "u1" });
    mockSignRefreshToken.mockReturnValue("candidate");
    mockSignAccessToken.mockReturnValue("new-access");
    mockPeek.mockResolvedValue({ state: "current", tenantId: "t1" });
  });

  it.each([
    "blocked_status",
    "no_membership",
    "tenant_inactive",
    "user_not_found",
  ])(
    "refuses renewal and revokes the refresh token when the check says %s",
    async (reason) => {
      mockRotateRefreshToken.mockResolvedValue(rotated({}));
      mockCheckAccountAccess.mockResolvedValue({ ok: false, reason });
      const cb = makeCallback();
      await refreshToken(makeCall({ refreshToken: "old" }), cb);
      expect(mockCheckAccountAccess).toHaveBeenCalledWith("u1", "t1");
      expect(cb).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          status: status.UNAUTHENTICATED,
          accessToken: "",
          refreshToken: "",
        }),
      );
      expect(mockSignAccessToken).not.toHaveBeenCalled();
      expect(revokeRefreshToken).toHaveBeenCalledWith("u1");
    },
  );

  it("signs the CURRENT role and database, not the refresh record's snapshot (demotion)", async () => {
    mockRotateRefreshToken.mockResolvedValue(rotated({ tenantRole: "owner" }));
    mockCheckAccountAccess.mockResolvedValue({
      ok: true,
      tenantRole: "employee",
      dbName: "db-current",
      employeeStatus: "Active",
    });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), cb);
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        tenantRole: "employee",
        dbName: "db-current",
      }),
    );
  });

  it("restores the real role after the Redis record was lost (Mongo fallback seeds tenantRole null)", async () => {
    // rotateRefreshToken's Mongo fallback (refreshTokenStore.ts) re-seeds
    // the record with tenantRole: null, dbName: null.
    mockRotateRefreshToken.mockResolvedValue(
      rotated({ tenantRole: null, dbName: null }),
    );
    mockCheckAccountAccess.mockResolvedValue({
      ok: true,
      tenantRole: "owner",
      dbName: "db-current",
      employeeStatus: "Active",
    });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), cb);
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tenantRole: "owner", dbName: "db-current" }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK, accessToken: "new-access" }),
    );
  });
});

// Nothing irreversible happens until the person has been verified.
describe("refreshToken — check before rotation", () => {
  const OK = {
    ok: true,
    tenantRole: "employee",
    dbName: "db-t1",
    employeeStatus: "Active",
  };
  const rotated = {
    ok: true,
    currentToken: "new-refresh",
    tenantId: "t1",
    tenantRole: "employee",
    dbName: "db-t1",
    orgSetupComplete: true,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyRefreshToken.mockReturnValue({ userId: "u1" });
    mockSignRefreshToken.mockReturnValue("candidate");
    mockSignAccessToken.mockReturnValue("new-access");
    mockPeek.mockResolvedValue({ state: "current", tenantId: "t1" });
    mockCheckAccountAccess.mockResolvedValue(OK);
    mockRotateRefreshToken.mockResolvedValue(rotated);
  });

  it("checks the account BEFORE rotating", async () => {
    const order: string[] = [];
    mockCheckAccountAccess.mockImplementation(
      async () => (order.push("check"), OK),
    );
    mockRotateRefreshToken.mockImplementation(
      async () => (order.push("rotate"), rotated),
    );
    await refreshToken(makeCall({ refreshToken: "old" }), makeCallback());
    expect(order).toEqual(["check", "rotate"]);
    expect(mockCheckAccountAccess).toHaveBeenCalledWith("u1", "t1");
  });

  it.each([
    ["Redis down (peek fails)", "peek"],
    ["Mongo down during the peek fallback", "peek"],
    ["account check times out", "check-timeout"],
    ["account check errors", "check-error"],
  ])(
    "outage BEFORE rotation (%s): UNAVAILABLE, session untouched",
    async (_l, where) => {
      if (where === "peek")
        mockPeek.mockRejectedValue(new Error("ECONNREFUSED"));
      if (where === "check-timeout")
        mockCheckAccountAccess.mockRejectedValue(unavailableErr("timeout"));
      if (where === "check-error")
        mockCheckAccountAccess.mockRejectedValue(unavailableErr("error"));
      const cb = makeCallback();
      await refreshToken(makeCall({ refreshToken: "old" }), cb);
      expect(cb).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          status: status.UNAVAILABLE,
          accessToken: "",
          refreshToken: "",
        }),
      );
      expect(mockRotateRefreshToken).not.toHaveBeenCalled(); // nothing irreversible
      expect(revokeRefreshToken).not.toHaveBeenCalled(); // an outage is not a denial
      expect(mockSignAccessToken).not.toHaveBeenCalled(); // nothing granted unverified
    },
  );

  it("a STALLED Redis (peek never answers) is bounded: UNAVAILABLE, no rotation", async () => {
    jest.useFakeTimers();
    try {
      mockPeek.mockReturnValue(new Promise(() => {}));
      const cb = makeCallback();
      const done = refreshToken(makeCall({ refreshToken: "old" }), cb);
      await jest.advanceTimersByTimeAsync(2_001);
      await done;
      expect(cb.mock.calls[0][1].status).toBe(status.UNAVAILABLE);
      expect(mockRotateRefreshToken).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("the SAME token works once the database is back (no session loss)", async () => {
    mockCheckAccountAccess.mockRejectedValueOnce(unavailableErr("timeout"));
    const first = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), first);
    expect(first.mock.calls[0][1].status).toBe(status.UNAVAILABLE);
    const retry = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), retry);
    expect(retry).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: status.OK,
        accessToken: "new-access",
        refreshToken: "new-refresh",
      }),
    );
    expect(mockRotateRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("outage DURING rotation (Redis fails in the atomic script): generic error, no revoke", async () => {
    mockRotateRefreshToken.mockRejectedValue(new Error("redis EVAL failed"));
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.INTERNAL);
    expect(revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("a stale/revoked token is rejected from the peek alone (no DB check, no rotation)", async () => {
    mockPeek.mockResolvedValue({ state: "invalid" });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "stolen-old" }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.UNAUTHENTICATED);
    expect(mockCheckAccountAccess).not.toHaveBeenCalled();
    expect(mockRotateRefreshToken).not.toHaveBeenCalled();
  });

  it("a denial revokes WITHOUT rotating first", async () => {
    mockCheckAccountAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.UNAUTHENTICATED);
    expect(revokeRefreshToken).toHaveBeenCalledWith("u1");
    expect(mockRotateRefreshToken).not.toHaveBeenCalled();
  });

  it("a grace-slot token (lost a concurrent rotation) is checked too, then re-served", async () => {
    mockPeek.mockResolvedValue({ state: "grace", tenantId: "t1" });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "just-rotated" }), cb);
    expect(mockCheckAccountAccess).toHaveBeenCalledWith("u1", "t1");
    expect(cb.mock.calls[0][1].status).toBe(status.OK);
  });

  it("refuses to sign when the record's organisation changed between check and rotation", async () => {
    mockRotateRefreshToken.mockResolvedValue({ ...rotated, tenantId: "t2" });
    const cb = makeCallback();
    await refreshToken(makeCall({ refreshToken: "old" }), cb);
    expect(cb.mock.calls[0][1].status).toBe(status.UNAUTHENTICATED);
    expect(mockSignAccessToken).not.toHaveBeenCalled();
  });
});
