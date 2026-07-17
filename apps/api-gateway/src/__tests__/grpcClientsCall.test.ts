import { status as GrpcStatus } from "@grpc/grpc-js";
import { grpcToHttpStatus } from "@hrms/common";
import { gatewayTenantStorage } from "../middleware/tenantContext";
import { grpcCall } from "../grpc/clients";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(() => Buffer.from("fake-cert")),
}));

jest.mock("@grpc/grpc-js", () => {
  const actual = jest.requireActual("@grpc/grpc-js");
  return {
    ...actual,
    credentials: { createSsl: jest.fn(() => ({ __creds: true })) },
    Client: class {},
  };
});

// Every *ServiceClient the real clients.ts module instantiates at import
// time — stubbed so module load doesn't need the real generated proto code.
jest.mock("@hrms/proto", () => {
  class FakeClient {
    constructor(..._args: any[]) {}
  }
  const svc = () => ({ [Object.keys({}).length]: FakeClient });
  return {
    auth: { AuthServiceClient: FakeClient },
    user: { UserServiceClient: FakeClient },
    employee: { EmployeeServiceClient: FakeClient },
    attendance: { AttendanceServiceClient: FakeClient },
    leave: { LeaveServiceClient: FakeClient },
    hrm: { HrmServiceClient: FakeClient },
    salary: { SalaryServiceClient: FakeClient },
    recruitment: { RecruitmentServiceClient: FakeClient },
    notification: { NotificationServiceClient: FakeClient },
    analytics: { AnalyticsServiceClient: FakeClient },
    performanceReview: { PerformanceReviewServiceClient: FakeClient },
  };
});

jest.mock("@hrms/common", () => ({
  grpcToHttpStatus: jest.fn(() => 500),
}));

jest.mock("../middleware/tenantContext", () => ({
  gatewayTenantStorage: { getStore: jest.fn() },
}));

const mockGetStore = gatewayTenantStorage.getStore as jest.Mock;
const mockGrpcToHttpStatus = grpcToHttpStatus as jest.Mock;

function makeFakeGrpcClient(
  implementation: (request: any, meta: any, cb: any) => void,
) {
  return { someMethod: jest.fn(implementation) };
}

describe("grpcCall", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStore.mockReturnValue(undefined);
  });

  it("resolves with the response on success", async () => {
    const client = makeFakeGrpcClient((_req, _meta, cb) =>
      cb(null, { ok: true }),
    );
    const result = await grpcCall(client, "someMethod", { id: "1" });
    expect(result).toEqual({ ok: true });
  });

  it("passes the request through to the underlying client method", async () => {
    const client = makeFakeGrpcClient((_req, _meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", { id: "42" });
    expect(client.someMethod).toHaveBeenCalledWith(
      { id: "42" },
      expect.anything(),
      expect.any(Function),
    );
  });

  it("rejects with the error, annotated with httpStatus, on failure", async () => {
    mockGrpcToHttpStatus.mockReturnValue(404);
    const grpcErr: any = new Error("not found");
    grpcErr.code = GrpcStatus.NOT_FOUND;
    const client = makeFakeGrpcClient((_req, _meta, cb) => cb(grpcErr, null));

    await expect(grpcCall(client, "someMethod", {})).rejects.toMatchObject({
      message: "not found",
      httpStatus: 404,
    });
    expect(mockGrpcToHttpStatus).toHaveBeenCalledWith(GrpcStatus.NOT_FOUND);
  });

  it("defaults to UNKNOWN status when the error carries no code", async () => {
    const grpcErr: any = new Error("mystery failure");
    const client = makeFakeGrpcClient((_req, _meta, cb) => cb(grpcErr, null));
    await expect(grpcCall(client, "someMethod", {})).rejects.toBeTruthy();
    expect(mockGrpcToHttpStatus).toHaveBeenCalledWith(GrpcStatus.UNKNOWN);
  });

  it("forwards tenantId/dbName from the ambient tenant-storage context as metadata", async () => {
    mockGetStore.mockReturnValue({ tenantId: "t1", dbName: "hrms-acme" });
    const client = makeFakeGrpcClient((_req, meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-tenant-id")).toEqual(["t1"]);
    expect(meta.get("x-tenant-db-name")).toEqual(["hrms-acme"]);
  });

  it("uses the explicit tenantIdOverride instead of the ambient context when provided", async () => {
    mockGetStore.mockReturnValue({ tenantId: "ambient-tenant" });
    const client = makeFakeGrpcClient((_req, meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", {}, "override-tenant");
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-tenant-id")).toEqual(["override-tenant"]);
  });

  it("omits tenant metadata entirely when there is no ambient context (pre-auth calls)", async () => {
    mockGetStore.mockReturnValue(undefined);
    const client = makeFakeGrpcClient((_req, meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-tenant-id")).toEqual([]);
  });

  it("forwards actor identity fields (for downstream audit-log attribution) when present", async () => {
    mockGetStore.mockReturnValue({
      tenantId: "t1",
      actor: {
        userId: "u1",
        username: "jdoe",
        ipAddress: "1.2.3.4",
        userAgent: "jest",
      },
    });
    const client = makeFakeGrpcClient((_req, meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-actor-user-id")).toEqual(["u1"]);
    expect(meta.get("x-actor-username")).toEqual(["jdoe"]);
    expect(meta.get("x-actor-ip")).toEqual(["1.2.3.4"]);
    expect(meta.get("x-actor-user-agent")).toEqual(["jest"]);
  });

  it("omits actor metadata fields that are falsy without throwing", async () => {
    mockGetStore.mockReturnValue({
      tenantId: "t1",
      actor: { userId: null, username: null },
    });
    const client = makeFakeGrpcClient((_req, meta, cb) => cb(null, {}));
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-actor-user-id")).toEqual([]);
  });
});
