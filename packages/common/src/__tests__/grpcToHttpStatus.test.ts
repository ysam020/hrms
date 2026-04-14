import { status as GrpcStatus } from "@grpc/grpc-js";
import { grpcToHttpStatus, RESPONSE_STATUS } from "../response";

describe("grpcToHttpStatus", () => {
  it("maps OK → 200", () => {
    expect(grpcToHttpStatus(GrpcStatus.OK)).toBe(RESPONSE_STATUS.SUCCESS);
  });

  it("maps INVALID_ARGUMENT → 400", () => {
    expect(grpcToHttpStatus(GrpcStatus.INVALID_ARGUMENT)).toBe(
      RESPONSE_STATUS.BAD_REQUEST,
    );
  });

  it("maps NOT_FOUND → 404", () => {
    expect(grpcToHttpStatus(GrpcStatus.NOT_FOUND)).toBe(
      RESPONSE_STATUS.NOT_FOUND,
    );
  });

  it("maps ALREADY_EXISTS → 409", () => {
    expect(grpcToHttpStatus(GrpcStatus.ALREADY_EXISTS)).toBe(
      RESPONSE_STATUS.CONFLICT,
    );
  });

  it("maps PERMISSION_DENIED → 403", () => {
    expect(grpcToHttpStatus(GrpcStatus.PERMISSION_DENIED)).toBe(
      RESPONSE_STATUS.FORBIDDEN,
    );
  });

  it("maps UNAUTHENTICATED → 401", () => {
    expect(grpcToHttpStatus(GrpcStatus.UNAUTHENTICATED)).toBe(
      RESPONSE_STATUS.UN_AUTHORIZED,
    );
  });

  it("maps RESOURCE_EXHAUSTED → 429", () => {
    expect(grpcToHttpStatus(GrpcStatus.RESOURCE_EXHAUSTED)).toBe(
      RESPONSE_STATUS.TOO_MANY_REQUEST,
    );
  });

  it("maps FAILED_PRECONDITION → 400", () => {
    expect(grpcToHttpStatus(GrpcStatus.FAILED_PRECONDITION)).toBe(
      RESPONSE_STATUS.BAD_REQUEST,
    );
  });

  it("maps OUT_OF_RANGE → 400", () => {
    expect(grpcToHttpStatus(GrpcStatus.OUT_OF_RANGE)).toBe(
      RESPONSE_STATUS.BAD_REQUEST,
    );
  });

  it("maps DEADLINE_EXCEEDED → 504", () => {
    expect(grpcToHttpStatus(GrpcStatus.DEADLINE_EXCEEDED)).toBe(
      RESPONSE_STATUS.GATEWAY_TIMEOUT,
    );
  });

  it("maps UNIMPLEMENTED → 501", () => {
    expect(grpcToHttpStatus(GrpcStatus.UNIMPLEMENTED)).toBe(
      RESPONSE_STATUS.NOT_IMPLEMENTED,
    );
  });

  it("maps INTERNAL → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.INTERNAL)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("maps UNAVAILABLE → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.UNAVAILABLE)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("maps CANCELLED → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.CANCELLED)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("maps UNKNOWN → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.UNKNOWN)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("maps DATA_LOSS → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.DATA_LOSS)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("maps ABORTED → 500", () => {
    expect(grpcToHttpStatus(GrpcStatus.ABORTED)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  it("defaults unknown status codes to 500", () => {
    expect(grpcToHttpStatus(9999 as GrpcStatus)).toBe(
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
    );
  });
});
