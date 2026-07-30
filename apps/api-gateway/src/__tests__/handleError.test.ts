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

import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

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
