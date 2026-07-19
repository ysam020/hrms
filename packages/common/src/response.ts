import { Response } from "express";
import { status as GrpcStatus } from "@grpc/grpc-js";

enum RESPONSE_STATUS {
  SUCCESS = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UN_AUTHORIZED = 401,
  PAYMENT_REQUIRES = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  GONE = 410,
  LARGE_ENTITY = 413,
  UN_SUPPORTED_MEDIA_TYPE = 415,
  UN_PROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUEST = 429,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  GATEWAY_TIMEOUT = 504,
}

function grpcToHttpStatus(grpcStatus: GrpcStatus): RESPONSE_STATUS {
  switch (grpcStatus) {
    case GrpcStatus.OK:
      return RESPONSE_STATUS.SUCCESS;
    case GrpcStatus.CANCELLED:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.UNKNOWN:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.DEADLINE_EXCEEDED:
      return RESPONSE_STATUS.GATEWAY_TIMEOUT;
    case GrpcStatus.INVALID_ARGUMENT:
      return RESPONSE_STATUS.BAD_REQUEST;
    case GrpcStatus.NOT_FOUND:
      return RESPONSE_STATUS.NOT_FOUND;
    case GrpcStatus.ALREADY_EXISTS:
      return RESPONSE_STATUS.CONFLICT;
    case GrpcStatus.PERMISSION_DENIED:
      return RESPONSE_STATUS.FORBIDDEN;
    case GrpcStatus.RESOURCE_EXHAUSTED:
      return RESPONSE_STATUS.TOO_MANY_REQUEST;
    case GrpcStatus.FAILED_PRECONDITION:
      return RESPONSE_STATUS.BAD_REQUEST;
    case GrpcStatus.ABORTED:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.OUT_OF_RANGE:
      return RESPONSE_STATUS.BAD_REQUEST;
    case GrpcStatus.UNIMPLEMENTED:
      return RESPONSE_STATUS.NOT_IMPLEMENTED;
    case GrpcStatus.INTERNAL:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.UNAVAILABLE:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.DATA_LOSS:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    case GrpcStatus.UNAUTHENTICATED:
      return RESPONSE_STATUS.UN_AUTHORIZED;
    default:
      return RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
  }
}

function apiResponse(res: Response, statusCode: RESPONSE_STATUS, data: any) {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    ...data,
  });
}

export { RESPONSE_STATUS, grpcToHttpStatus, apiResponse };
