import { Prisma } from "@prisma/client";
import { handleError } from "../utils/handleError";

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    UN_AUTHORIZED: 401,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";

const mockApiResponse = apiResponse as jest.Mock;
const makeRes = () => ({ json: jest.fn() }) as any;

function makePrismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Prisma error", {
    code,
    clientVersion: "5.0.0",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Prisma known error codes ─────────────────────────────────────────────────

describe("handleError — Prisma known errors", () => {
  it("maps P2002 (unique constraint) to 409 CONFLICT", () => {
    const res = makeRes();
    handleError(res, makePrismaError("P2002"));
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.CONFLICT,
      expect.objectContaining({
        message: "A record with this data already exists",
      }),
    );
  });

  it("maps P2025 (record not found) to 404 NOT_FOUND", () => {
    const res = makeRes();
    handleError(res, makePrismaError("P2025"));
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.objectContaining({ message: "Record not found" }),
    );
  });

  it("maps P2003 (foreign key violation) to 400 BAD_REQUEST", () => {
    const res = makeRes();
    handleError(res, makePrismaError("P2003"));
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.objectContaining({ message: "Invalid reference data" }),
    );
  });

  it("falls through to 500 for unknown Prisma error codes", () => {
    const res = makeRes();
    handleError(res, makePrismaError("P9999"));
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

// ─── gRPC annotated errors ────────────────────────────────────────────────────

describe("handleError — gRPC annotated errors", () => {
  it("uses httpStatus 404 from annotated gRPC error", () => {
    const res = makeRes();
    const grpcErr = Object.assign(new Error("not found"), { httpStatus: 404 });
    handleError(res, grpcErr);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      404,
      expect.objectContaining({ message: "not found" }),
    );
  });

  it("uses httpStatus 504 (gateway timeout) from annotated gRPC error", () => {
    const res = makeRes();
    const grpcErr = Object.assign(new Error("deadline exceeded"), {
      httpStatus: 504,
    });
    handleError(res, grpcErr);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      504,
      expect.objectContaining({ message: "deadline exceeded" }),
    );
  });

  it("uses httpStatus 503 (unavailable) from annotated gRPC error", () => {
    const res = makeRes();
    const grpcErr = Object.assign(new Error("service unavailable"), {
      httpStatus: 503,
    });
    handleError(res, grpcErr);
    expect(mockApiResponse).toHaveBeenCalledWith(res, 503, expect.any(Object));
  });

  it("falls back to 'Service error' when annotated error has no message", () => {
    const res = makeRes();
    const grpcErr = { httpStatus: 502, message: "" };
    handleError(res, grpcErr);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      502,
      expect.objectContaining({ message: "Service error" }),
    );
  });
});

// ─── Razorpay SDK errors ──────────────────────────────────────────────────────

describe("handleError — Razorpay SDK errors", () => {
  it("surfaces the Razorpay statusCode and description instead of a generic 500", () => {
    const res = makeRes();
    const rzpErr = {
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "subscriptions cannot be updated when payment mode is upi",
      },
    };
    handleError(res, rzpErr);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      400,
      expect.objectContaining({
        message: "subscriptions cannot be updated when payment mode is upi",
      }),
    );
  });

  it("falls back to 500 when statusCode is present but error.description is missing", () => {
    const res = makeRes();
    handleError(res, { statusCode: 400, error: {} });
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

// ─── Unknown / generic errors ─────────────────────────────────────────────────

describe("handleError — unknown errors", () => {
  it("returns 500 for a plain Error without httpStatus", () => {
    const res = makeRes();
    handleError(res, new Error("something broke"));
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.objectContaining({ message: "Internal Server Error" }),
    );
  });

  it("returns 500 for a thrown string", () => {
    const res = makeRes();
    handleError(res, "unexpected string error");
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("returns 500 for null", () => {
    const res = makeRes();
    handleError(res, null);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("logging", () => {
  const reqFor = (originalUrl: string) => ({
    method: "POST",
    originalUrl,
    baseUrl: "/api/v1",
    route: { path: "/hrm/activities/:id" },
  });

  it("logs an unexpected error with service, route pattern and path before returning a generic 500", () => {
    const res = {
      json: jest.fn(),
      req: reqFor("/api/v1/hrm/activities/a1"),
    } as any;
    const err = new Error("db exploded");

    handleError(res, err);

    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled error returned as 500",
      {
        err,
        service: "api-gateway",
        method: "POST",
        route: "/api/v1/hrm/activities/:id",
        path: "/api/v1/hrm/activities/a1",
      },
    );
    // The client-facing response is unchanged.
    expect(mockApiResponse).toHaveBeenCalledWith(res, 500, {
      message: "Internal Server Error",
    });
  });

  it("drops the query string, which can carry tokens, from the logged path", () => {
    const res = {
      json: jest.fn(),
      req: reqFor("/api/v1/hrm/activities/a1?token=secret-reset-token"),
    } as any;
    handleError(res, new Error("boom"));
    const logged = (logger.error as jest.Mock).mock.calls[0][1];
    expect(JSON.stringify(logged)).not.toContain("secret-reset-token");
    expect(logged.path).toBe("/api/v1/hrm/activities/a1");
  });

  it("does not log an error the call site already logged (no duplicate lines)", () => {
    const err = new Error("already reported");
    // What @hrms/logger does to every Error it writes.
    Object.defineProperty(err, Symbol.for("hrms.logger.logged"), {
      value: true,
    });
    handleError({ json: jest.fn(), req: reqFor("/x") } as any, err);
    expect(logger.error).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(expect.anything(), 500, {
      message: "Internal Server Error",
    });
  });

  it("still logs a thrown non-Error value (it can't have been marked)", () => {
    handleError({ json: jest.fn(), req: reqFor("/x") } as any, "plain string");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("does not log errors it maps to a client status", () => {
    handleError(makeRes(), makePrismaError("P2025"));
    handleError(
      makeRes(),
      Object.assign(new Error("nope"), { httpStatus: 403 }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
