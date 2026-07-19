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
  implementation: (request: any, meta: any, options: any, cb: any) => void,
) {
  return { someMethod: jest.fn(implementation) };
}

describe("grpcCall", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStore.mockReturnValue(undefined);
  });

  it("resolves with the response on success", async () => {
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(null, { ok: true }),
    );
    const result = await grpcCall(client, "someMethod", { id: "1" });
    expect(result).toEqual({ ok: true });
  });

  it("passes the request through to the underlying client method", async () => {
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", { id: "42" });
    expect(client.someMethod).toHaveBeenCalledWith(
      { id: "42" },
      expect.anything(),
      expect.anything(),
      expect.any(Function),
    );
  });

  it("passes a default deadline so a hung downstream service can't hang the request forever", async () => {
    const before = Date.now();
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", {});
    const options = client.someMethod.mock.calls[0][2];
    expect(options.deadline).toBeGreaterThanOrEqual(before + 8_000);
    expect(options.deadline).toBeLessThan(before + 8_000 + 2_000);
  });

  it("honors an explicit deadlineMs override", async () => {
    const before = Date.now();
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", {}, undefined, 30_000);
    const options = client.someMethod.mock.calls[0][2];
    expect(options.deadline).toBeGreaterThanOrEqual(before + 30_000);
  });

  it("rejects with the error, annotated with httpStatus, on failure", async () => {
    mockGrpcToHttpStatus.mockReturnValue(404);
    const grpcErr: any = new Error("not found");
    grpcErr.code = GrpcStatus.NOT_FOUND;
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(grpcErr, null),
    );

    await expect(grpcCall(client, "someMethod", {})).rejects.toMatchObject({
      message: "not found",
      httpStatus: 404,
    });
    expect(mockGrpcToHttpStatus).toHaveBeenCalledWith(GrpcStatus.NOT_FOUND);
  });

  it("defaults to UNKNOWN status when the error carries no code", async () => {
    const grpcErr: any = new Error("mystery failure");
    const client = makeFakeGrpcClient((_req, _meta, _options, cb) =>
      cb(grpcErr, null),
    );
    await expect(grpcCall(client, "someMethod", {})).rejects.toBeTruthy();
    expect(mockGrpcToHttpStatus).toHaveBeenCalledWith(GrpcStatus.UNKNOWN);
  });

  it("forwards tenantId/dbName from the ambient tenant-storage context as metadata", async () => {
    mockGetStore.mockReturnValue({ tenantId: "t1", dbName: "hrms-acme" });
    const client = makeFakeGrpcClient((_req, meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-tenant-id")).toEqual(["t1"]);
    expect(meta.get("x-tenant-db-name")).toEqual(["hrms-acme"]);
  });

  it("uses the explicit tenantIdOverride instead of the ambient context when provided", async () => {
    mockGetStore.mockReturnValue({ tenantId: "ambient-tenant" });
    const client = makeFakeGrpcClient((_req, meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", {}, "override-tenant");
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-tenant-id")).toEqual(["override-tenant"]);
  });

  it("omits tenant metadata entirely when there is no ambient context (pre-auth calls)", async () => {
    mockGetStore.mockReturnValue(undefined);
    const client = makeFakeGrpcClient((_req, meta, _options, cb) =>
      cb(null, {}),
    );
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
    const client = makeFakeGrpcClient((_req, meta, _options, cb) =>
      cb(null, {}),
    );
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
    const client = makeFakeGrpcClient((_req, meta, _options, cb) =>
      cb(null, {}),
    );
    await grpcCall(client, "someMethod", {});
    const meta = client.someMethod.mock.calls[0][1];
    expect(meta.get("x-actor-user-id")).toEqual([]);
  });
});

// This is the exact gap the platform audit found: BaseGrpcClient's retry
// policy existed and was tested in @hrms/grpc-client, but nothing on the
// real gateway->microservice path (grpcCall, used at every handler call
// site) ever invoked it, so production traffic got zero retry protection
// despite the audited "fix." These tests exercise grpcCall's own retry loop
// directly, independent of BaseGrpcClient's tests.
describe("grpcCall retries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStore.mockReturnValue(undefined);
  });

  const unavailableErr = () =>
    Object.assign(new Error("unavailable"), { code: GrpcStatus.UNAVAILABLE });

  it("retries a connection-level (UNAVAILABLE) failure and resolves once a later attempt succeeds", async () => {
    jest.useFakeTimers();
    try {
      const spy = jest
        .fn()
        .mockImplementationOnce((_req, _meta, _options, cb) =>
          cb(unavailableErr(), null),
        )
        .mockImplementationOnce((_req, _meta, _options, cb) =>
          cb(null, { ok: true }),
        );
      const client = makeFakeGrpcClient(spy);

      const result = grpcCall(client, "someMethod", { id: "1" });

      await Promise.resolve(); // let the first attempt's rejection settle
      expect(spy).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100); // covers the [0,100ms) jittered backoff for attempt 0
      expect(spy).toHaveBeenCalledTimes(2);

      await expect(result).resolves.toEqual({ ok: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not retry a deterministic error (e.g. NOT_FOUND) — the client method is called exactly once", async () => {
    mockGrpcToHttpStatus.mockReturnValue(404);
    const err = Object.assign(new Error("not found"), {
      code: GrpcStatus.NOT_FOUND,
    });
    const spy = jest.fn((_req, _meta, _options, cb) => cb(err, null));
    const client = makeFakeGrpcClient(spy);

    await expect(grpcCall(client, "someMethod", {})).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting the default retry budget and rejects with the last error, annotated with httpStatus", async () => {
    jest.useFakeTimers();
    // grpcRetryDelayMs applies full jitter (Math.random() * cap), so the
    // actual delay is only ever <= the cap, never exactly it. This test
    // advances timers in two separate steps to check the call count after
    // each retry individually, which needs a deterministic delay — pin
    // Math.random to 1 so each wait equals its cap exactly.
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(1);
    try {
      mockGrpcToHttpStatus.mockReturnValue(503);
      const spy = jest.fn((_req, _meta, _options, cb) =>
        cb(unavailableErr(), null),
      );
      const client = makeFakeGrpcClient(spy);

      const result = grpcCall(client, "someMethod", {});
      const assertion = expect(result).rejects.toMatchObject({
        message: "unavailable",
        httpStatus: 503,
      });

      await Promise.resolve();
      expect(spy).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(100); // attempt 1 backoff
      expect(spy).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(200); // attempt 2 backoff
      expect(spy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries (default budget)

      await assertion;
    } finally {
      randomSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("honors an explicit retries override of 0 — no retry even for UNAVAILABLE", async () => {
    const spy = jest.fn((_req, _meta, _options, cb) =>
      cb(unavailableErr(), null),
    );
    const client = makeFakeGrpcClient(spy);

    await expect(
      grpcCall(client, "someMethod", {}, undefined, undefined, 0),
    ).rejects.toMatchObject({ message: "unavailable" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh deadline for each retry attempt rather than the original one", async () => {
    jest.useFakeTimers();
    try {
      const spy = jest
        .fn()
        .mockImplementationOnce((_req, _meta, _options, cb) =>
          cb(unavailableErr(), null),
        )
        .mockImplementationOnce((_req, _meta, _options, cb) => cb(null, {}));
      const client = makeFakeGrpcClient(spy);

      const result = grpcCall(client, "someMethod", {}, undefined, 5_000);
      await Promise.resolve();
      const firstDeadline = spy.mock.calls[0][2].deadline;

      await jest.advanceTimersByTimeAsync(100);
      await result;
      const secondDeadline = spy.mock.calls[1][2].deadline;

      // The second attempt's deadline is computed at its own start time, not
      // inherited from the first attempt — it should be later, not equal.
      expect(secondDeadline).toBeGreaterThan(firstDeadline);
    } finally {
      jest.useRealTimers();
    }
  });
});
