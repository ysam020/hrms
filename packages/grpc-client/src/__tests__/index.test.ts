import fs from "fs";
import * as grpc from "@grpc/grpc-js";
import { BaseGrpcClient, GrpcClientConfig } from "../index";

jest.mock("fs", () => ({
  readFileSync: jest.fn((p: string) => Buffer.from(`cert-content:${p}`)),
}));

const mockCreateSsl = jest.fn().mockReturnValue({ __ssl: true });
const mockClientInstances: any[] = [];

jest.mock("@grpc/grpc-js", () => {
  class FakeClient {
    address: string;
    credentials: any;
    options: any;
    calls: Record<string, jest.Mock> = {};
    constructor(address: string, credentials: any, options: any) {
      this.address = address;
      this.credentials = credentials;
      this.options = options;
      mockClientInstances.push(this);
    }
    [key: string]: any;
  }
  return {
    Client: FakeClient,
    credentials: {
      createSsl: (...args: any[]) => mockCreateSsl(...args),
    },
    // makeCall's RETRYABLE_CODES set is built from grpc.status at class-load
    // time — without real enum values here, that static initializer would
    // read `undefined.UNAVAILABLE` and throw. Inlined (rather than pulled in
    // via jest.requireActual) since the real module needs more of `fs` than
    // this file's minimal fs mock provides.
    status: {
      OK: 0,
      CANCELLED: 1,
      UNKNOWN: 2,
      INVALID_ARGUMENT: 3,
      DEADLINE_EXCEEDED: 4,
      NOT_FOUND: 5,
      ALREADY_EXISTS: 6,
      PERMISSION_DENIED: 7,
      RESOURCE_EXHAUSTED: 8,
      FAILED_PRECONDITION: 9,
      ABORTED: 10,
      OUT_OF_RANGE: 11,
      UNIMPLEMENTED: 12,
      INTERNAL: 13,
      UNAVAILABLE: 14,
      DATA_LOSS: 15,
      UNAUTHENTICATED: 16,
    },
  };
});

describe("BaseGrpcClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientInstances.length = 0;
    delete process.env.GRPC_TLS_CA_FILE;
    delete process.env.GRPC_TLS_CLIENT_CRT_FILE;
    delete process.env.GRPC_TLS_CLIENT_KEY_FILE;
  });

  it("uses explicitly provided credentials without reading any cert files", () => {
    const explicitCreds = { __explicit: true } as any;
    const config: GrpcClientConfig = {
      serviceName: "leave",
      address: "localhost:50051",
      credentials: explicitCreds,
    };

    new BaseGrpcClient(config);

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(mockClientInstances[0].credentials).toBe(explicitCreds);
  });

  it("builds default mTLS credentials from cert file paths when none are provided", () => {
    const config: GrpcClientConfig = {
      serviceName: "leave",
      address: "localhost:50051",
    };

    new BaseGrpcClient(config);

    expect(fs.readFileSync).toHaveBeenCalledTimes(3);
    expect(mockCreateSsl).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer),
      expect.any(Buffer),
      expect.objectContaining({ checkServerIdentity: expect.any(Function) }),
    );
    expect(mockClientInstances[0].credentials).toEqual({ __ssl: true });
  });

  it("reads cert paths from GRPC_TLS_* env vars when set, instead of the defaults", () => {
    process.env.GRPC_TLS_CA_FILE = "/custom/ca.pem";
    process.env.GRPC_TLS_CLIENT_CRT_FILE = "/custom/client-cert.pem";
    process.env.GRPC_TLS_CLIENT_KEY_FILE = "/custom/client-key.pem";

    new BaseGrpcClient({ serviceName: "leave", address: "localhost:50051" });

    const readPaths = (fs.readFileSync as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(readPaths).toEqual(
      expect.arrayContaining([
        "/custom/ca.pem",
        "/custom/client-key.pem",
        "/custom/client-cert.pem",
      ]),
    );
  });

  it("constructs the grpc.Client with the target address and merged keepalive + custom options", () => {
    new BaseGrpcClient({
      serviceName: "leave",
      address: "leave-service:50051",
      options: { "grpc.keepalive_time_ms": 999 },
    });

    const instance = mockClientInstances[0];
    expect(instance.address).toBe("leave-service:50051");
    expect(instance.options).toEqual(
      expect.objectContaining({
        "grpc.keepalive_timeout_ms": 20000,
        "grpc.http2.max_pings_without_data": 0,
        "grpc.keepalive_time_ms": 999, // custom option overrides the default
      }),
    );
  });

  it("excludes timeout/retries from the channel options passed to grpc.Client — they're call-level concerns, not channel options", () => {
    new BaseGrpcClient({
      serviceName: "leave",
      address: "leave-service:50051",
      options: { timeout: 5000, retries: 2 },
    });

    const instance = mockClientInstances[0];
    expect(instance.options).not.toHaveProperty("timeout");
    expect(instance.options).not.toHaveProperty("retries");
  });

  it("makeCall resolves with the response on success", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
    });
    const rawClient = mockClientInstances[0];
    rawClient.getLeaves = (_req: any, _options: any, cb: any) =>
      cb(null, { data: "ok" });

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).resolves.toEqual({
      data: "ok",
    });
  });

  it("makeCall rejects with the error on failure", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
    });
    const rawClient = mockClientInstances[0];
    const err = new Error("unavailable");
    rawClient.getLeaves = (_req: any, _options: any, cb: any) => cb(err, null);

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).rejects.toBe(err);
  });

  it("makeCall passes the request and a deadline through to the underlying method", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
    });
    const rawClient = mockClientInstances[0];
    const spy = jest.fn((_req: any, _options: any, cb: any) => cb(null, {}));
    rawClient.getLeaves = spy;

    const before = Date.now();
    await (client as any).makeCall("getLeaves", { id: "42" });

    expect(spy).toHaveBeenCalledWith(
      { id: "42" },
      expect.objectContaining({ deadline: expect.any(Number) }),
      expect.any(Function),
    );
    const deadline = spy.mock.calls[0][1].deadline;
    expect(deadline).toBeGreaterThanOrEqual(before + 8_000);
  });

  it("makeCall uses config.options.timeout as the deadline instead of the 8s default", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
      options: { timeout: 2_000 },
    });
    const rawClient = mockClientInstances[0];
    const spy = jest.fn((_req: any, _options: any, cb: any) => cb(null, {}));
    rawClient.getLeaves = spy;

    const before = Date.now();
    await (client as any).makeCall("getLeaves", { id: "1" });

    const deadline = spy.mock.calls[0][1].deadline;
    expect(deadline).toBeGreaterThanOrEqual(before + 2_000);
    expect(deadline).toBeLessThan(before + 8_000);
  });

  it("makeCall retries config.options.retries additional times before giving up", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
      options: { retries: 2 },
    });
    const rawClient = mockClientInstances[0];
    const err = Object.assign(new Error("unavailable"), {
      code: grpc.status.UNAVAILABLE,
    });
    const spy = jest
      .fn()
      .mockImplementationOnce((_req: any, _options: any, cb: any) =>
        cb(err, null),
      )
      .mockImplementationOnce((_req: any, _options: any, cb: any) =>
        cb(err, null),
      )
      .mockImplementationOnce((_req: any, _options: any, cb: any) =>
        cb(null, { data: "ok" }),
      );
    rawClient.getLeaves = spy;

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).resolves.toEqual({ data: "ok" });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("makeCall rejects with the last error once retries are exhausted", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
      options: { retries: 1 },
    });
    const rawClient = mockClientInstances[0];
    const err = Object.assign(new Error("still unavailable"), {
      code: grpc.status.UNAVAILABLE,
    });
    const spy = jest.fn((_req: any, _options: any, cb: any) => cb(err, null));
    rawClient.getLeaves = spy;

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).rejects.toBe(err);
    expect(spy).toHaveBeenCalledTimes(2); // 1 initial attempt + 1 retry
  });

  it("makeCall does not retry a non-retryable (deterministic) error code even when retries > 0", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
      options: { retries: 3 },
    });
    const rawClient = mockClientInstances[0];
    const err = Object.assign(new Error("bad request"), {
      code: grpc.status.INVALID_ARGUMENT,
    });
    const spy = jest.fn((_req: any, _options: any, cb: any) => cb(err, null));
    rawClient.getLeaves = spy;

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).rejects.toBe(err);
    expect(spy).toHaveBeenCalledTimes(1); // no retries for a deterministic failure
  });

  it("makeCall waits with escalating backoff between retryable attempts", async () => {
    jest.useFakeTimers();
    // grpcRetryDelayMs applies full jitter (Math.random() * cap) so the
    // actual delay is only ever <= the cap, never exactly it — pin
    // Math.random to 1 so this test can assert deterministic wait times
    // instead of racing the real randomness.
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(1);
    try {
      const client = new BaseGrpcClient({
        serviceName: "leave",
        address: "localhost:50051",
        credentials: {} as any,
        options: { retries: 2 },
      });
      const rawClient = mockClientInstances[0];
      const err = Object.assign(new Error("unavailable"), {
        code: grpc.status.UNAVAILABLE,
      });
      const spy = jest
        .fn()
        .mockImplementationOnce((_req: any, _options: any, cb: any) =>
          cb(err, null),
        )
        .mockImplementationOnce((_req: any, _options: any, cb: any) =>
          cb(err, null),
        )
        .mockImplementationOnce((_req: any, _options: any, cb: any) =>
          cb(null, { data: "ok" }),
        );
      rawClient.getLeaves = spy;

      const result = (client as any).makeCall("getLeaves", { id: "1" });

      await Promise.resolve(); // let the first attempt's rejection settle
      expect(spy).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100); // first backoff: 100ms
      expect(spy).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(200); // second backoff: 200ms
      expect(spy).toHaveBeenCalledTimes(3);

      await expect(result).resolves.toEqual({ data: "ok" });
    } finally {
      randomSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
