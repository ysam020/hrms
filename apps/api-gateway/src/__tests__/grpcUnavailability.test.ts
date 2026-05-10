/**
 * grpcUnavailability.test.ts
 *
 * Verifies that when a downstream gRPC service is unavailable the gateway
 * returns the correct HTTP status code rather than crashing or swallowing the
 * error.  Each test domain (analytics / leave / auth) exercises four failure
 * modes using the gRPC status codes and the httpStatus annotation that
 * grpcCall attaches before rejecting.
 *
 * Status-code mapping comes from grpcToHttpStatus in @hrms/common:
 *   UNAVAILABLE       → 500  (maps to INTERNAL_SERVER_ERROR)
 *   DEADLINE_EXCEEDED → 504  (maps to GATEWAY_TIMEOUT)
 *   NOT_FOUND         → 404
 *   INTERNAL          → 500  (maps to INTERNAL_SERVER_ERROR)
 */

import { status as GrpcStatus } from "@grpc/grpc-js";

// ---------------------------------------------------------------------------
// Module mocks – must be declared before any handler imports so that Jest
// hoists them above the import block.
// ---------------------------------------------------------------------------

jest.mock("../grpc/clients", () => ({
  analyticsClient: {},
  authClient: {},
  leaveClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, statusCode: number, data: any) =>
    res.json({ statusCode, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    GATEWAY_TIMEOUT: 504,
    UN_AUTHORIZED: 401,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// auth.ts imports these — provide minimal stubs so the module can load
jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/crypto", () => ({
  aesEncrypt: jest.fn((v: string) => `enc:${v}`),
  aesDecrypt: jest.fn((v: string) => v),
  safeDecrypt: jest.fn((v: any) => v || ""),
}));

jest.mock("jsonwebtoken", () => ({
  __esModule: true,
  default: { verify: jest.fn(), decode: jest.fn().mockReturnValue(null) },
}));

jest.mock("../services/loginEventService", () => ({
  recordLoginEvent: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Deferred imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { prisma } from "@hrms/db";
import { getDashboardStats } from "../handlers/analytics";
import { getLeaveApplications } from "../handlers/leave";
import { logout } from "../handlers/auth";

// ---------------------------------------------------------------------------
// Typed aliases
// ---------------------------------------------------------------------------

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeRes = () => ({ json: jest.fn() }) as any;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1", email: "user@test.com" },
    query: {},
    params: {},
    body: {},
    cookies: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "user-agent": "test-agent" },
    ...overrides,
  }) as any;

/**
 * Build a ServiceError-shaped object that mirrors what grpcCall rejects with.
 * grpcCall annotates the error with `httpStatus` before rejecting, so we set
 * both fields here to replicate that behaviour faithfully.
 */
function makeGrpcError(
  code: GrpcStatus,
  httpStatus: number,
  message: string,
): Error & { code: GrpcStatus; httpStatus: number } {
  const err = new Error(message) as any;
  err.code = code;
  err.httpStatus = httpStatus;
  return err;
}

// ---------------------------------------------------------------------------
// Domain 1: Analytics — getDashboardStats
// ---------------------------------------------------------------------------

describe("gRPC unavailability – analytics domain (getDashboardStats)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("UNAVAILABLE → HTTP 500", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.UNAVAILABLE,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "analytics service unavailable",
      ),
    );

    const res = makeRes();
    await getDashboardStats(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("DEADLINE_EXCEEDED → HTTP 504", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.DEADLINE_EXCEEDED,
        RESPONSE_STATUS.GATEWAY_TIMEOUT,
        "analytics request timed out",
      ),
    );

    const res = makeRes();
    await getDashboardStats(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.GATEWAY_TIMEOUT,
      expect.any(Object),
    );
  });

  it("NOT_FOUND → HTTP 404", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.NOT_FOUND,
        RESPONSE_STATUS.NOT_FOUND,
        "analytics resource not found",
      ),
    );

    const res = makeRes();
    await getDashboardStats(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
  });

  it("INTERNAL → HTTP 500", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.INTERNAL,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "analytics internal error",
      ),
    );

    const res = makeRes();
    await getDashboardStats(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Domain 2: Leave — getLeaveApplications
// ---------------------------------------------------------------------------

describe("gRPC unavailability – leave domain (getLeaveApplications)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // resolveUsername / isSuperUser lookups both go through findUnique
    mockUserFindUnique
      .mockResolvedValueOnce({ isSuperUser: false }) // isSuperUser check
      .mockResolvedValueOnce({ username: "john" });  // resolveUsername
  });

  it("UNAVAILABLE → HTTP 500", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.UNAVAILABLE,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "leave service unavailable",
      ),
    );

    const res = makeRes();
    await getLeaveApplications(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("DEADLINE_EXCEEDED → HTTP 504", async () => {
    // Reset the findUnique mock chain for this test
    mockUserFindUnique
      .mockReset()
      .mockResolvedValueOnce({ isSuperUser: false })
      .mockResolvedValueOnce({ username: "john" });

    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.DEADLINE_EXCEEDED,
        RESPONSE_STATUS.GATEWAY_TIMEOUT,
        "leave request timed out",
      ),
    );

    const res = makeRes();
    await getLeaveApplications(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.GATEWAY_TIMEOUT,
      expect.any(Object),
    );
  });

  it("NOT_FOUND → HTTP 404", async () => {
    mockUserFindUnique
      .mockReset()
      .mockResolvedValueOnce({ isSuperUser: false })
      .mockResolvedValueOnce({ username: "john" });

    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.NOT_FOUND,
        RESPONSE_STATUS.NOT_FOUND,
        "leave record not found",
      ),
    );

    const res = makeRes();
    await getLeaveApplications(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
  });

  it("INTERNAL → HTTP 500", async () => {
    mockUserFindUnique
      .mockReset()
      .mockResolvedValueOnce({ isSuperUser: false })
      .mockResolvedValueOnce({ username: "john" });

    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.INTERNAL,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "leave service internal error",
      ),
    );

    const res = makeRes();
    await getLeaveApplications(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Domain 3: Auth — logout
// ---------------------------------------------------------------------------

describe("gRPC unavailability – auth domain (logout)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("UNAVAILABLE → HTTP 500", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.UNAVAILABLE,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "auth service unavailable",
      ),
    );

    const res = { json: jest.fn(), clearCookie: jest.fn() } as any;
    await logout(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("DEADLINE_EXCEEDED → HTTP 504", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.DEADLINE_EXCEEDED,
        RESPONSE_STATUS.GATEWAY_TIMEOUT,
        "auth request timed out",
      ),
    );

    const res = { json: jest.fn(), clearCookie: jest.fn() } as any;
    await logout(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.GATEWAY_TIMEOUT,
      expect.any(Object),
    );
  });

  it("NOT_FOUND → HTTP 404", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.NOT_FOUND,
        RESPONSE_STATUS.NOT_FOUND,
        "auth user not found",
      ),
    );

    const res = { json: jest.fn(), clearCookie: jest.fn() } as any;
    await logout(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
  });

  it("INTERNAL → HTTP 500", async () => {
    mockGrpcCall.mockRejectedValue(
      makeGrpcError(
        GrpcStatus.INTERNAL,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        "auth service internal error",
      ),
    );

    const res = { json: jest.fn(), clearCookie: jest.fn() } as any;
    await logout(makeReq(), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});
