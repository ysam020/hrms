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
      options: { timeout: 5000, "grpc.keepalive_time_ms": 999 },
    });

    const instance = mockClientInstances[0];
    expect(instance.address).toBe("leave-service:50051");
    expect(instance.options).toEqual(
      expect.objectContaining({
        "grpc.keepalive_timeout_ms": 20000,
        "grpc.http2.max_pings_without_data": 0,
        timeout: 5000,
        "grpc.keepalive_time_ms": 999, // custom option overrides the default
      }),
    );
  });

  it("makeCall resolves with the response on success", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
    });
    const rawClient = mockClientInstances[0];
    rawClient.getLeaves = (_req: any, cb: any) => cb(null, { data: "ok" });

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
    rawClient.getLeaves = (_req: any, cb: any) => cb(err, null);

    await expect(
      (client as any).makeCall("getLeaves", { id: "1" }),
    ).rejects.toBe(err);
  });

  it("makeCall passes the request through to the underlying method", async () => {
    const client = new BaseGrpcClient({
      serviceName: "leave",
      address: "localhost:50051",
      credentials: {} as any,
    });
    const rawClient = mockClientInstances[0];
    const spy = jest.fn((_req: any, cb: any) => cb(null, {}));
    rawClient.getLeaves = spy;

    await (client as any).makeCall("getLeaves", { id: "42" });

    expect(spy).toHaveBeenCalledWith({ id: "42" }, expect.any(Function));
  });
});
