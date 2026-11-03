import { runWithTenant, getClientForDb } from "@hrms/db";
import { grpcApiRequestLogger } from "@hrms/logger";
import { BaseGrpcServer } from "../base-server";

const mockServerInstance = {
  addService: jest.fn(),
  bindAsync: jest.fn(
    (_addr: string, _creds: any, cb: (err: Error | null) => void) => cb(null),
  ),
  tryShutdown: jest.fn((cb: (err?: Error) => void) => cb()),
};

jest.mock("@grpc/grpc-js", () => {
  const actual = jest.requireActual("@grpc/grpc-js");
  return {
    ...actual,
    Server: jest.fn().mockImplementation(() => mockServerInstance),
    ServerCredentials: {
      ...actual.ServerCredentials,
      createSsl: jest.fn(() => ({ __serverCreds: true })),
    },
  };
});

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(() => Buffer.from("fake-cert")),
}));

jest.mock("@hrms/db", () => ({
  runWithTenant: jest.fn((_tid, _client, fn) => fn()),
  getClientForDb: jest.fn(() => ({ __tenantClient: true })),
  withQueryStats: (fn: () => unknown) => fn(),
  currentQueryStats: jest.fn(() => undefined),
  summarizeQueryStats: jest.fn(),
  warmUpDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  grpcApiRequestLogger: jest.fn((_call: any, next: () => Promise<any>) =>
    next(),
  ),
}));

class TestServer extends BaseGrpcServer {
  public callWrapHandler(handler: any) {
    return this.wrapHandler(handler);
  }
  public callAddService(service: any, impl: any) {
    return this.addService(service, impl);
  }
  public callAddMiddleware(mw: any) {
    return this.addMiddleware(mw);
  }
  public callWrapWithValidation(handler: any, schema: any) {
    return this.wrapWithValidation(handler, schema);
  }
}

function makeCall(metadataEntries: Record<string, string> = {}) {
  const metadata = {
    get: (key: string) => (metadataEntries[key] ? [metadataEntries[key]] : []),
  };
  return { metadata, request: {} };
}

describe("BaseGrpcServer", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("wrapHandler", () => {
    it("invokes the handler and forwards its response via callback", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(null, { ok: true }));
      const wrapped = server.callWrapHandler(handler);
      const callback = jest.fn();

      await wrapped(makeCall(), callback);

      expect(handler).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(null, { ok: true });
    });

    it("routes a thrown handler error through errorHandler into the callback", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(new Error("boom"), null));
      const wrapped = server.callWrapHandler(handler);
      const callback = jest.fn();

      await wrapped(makeCall(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ message: "boom" }),
        null,
      );
    });

    // Both used to escape the middleware chain's promise and leave the call
    // hanging until the client's deadline.
    it("answers with an error when an async handler throws after an await", async () => {
      const server = new TestServer();
      const handler = jest.fn(async () => {
        await Promise.resolve();
        throw new Error("late boom");
      });
      const callback = jest.fn();

      await server.callWrapHandler(handler)(makeCall(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ message: "late boom" }),
        null,
      );
    });

    it("answers with an error passed to the callback asynchronously", async () => {
      const server = new TestServer();
      const handler = jest.fn(async (_call, cb) => {
        await Promise.resolve();
        cb(new Error("async cb error"), null);
      });
      const callback = jest.fn();

      await server.callWrapHandler(handler)(makeCall(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ message: "async cb error" }),
        null,
      );
    });

    it("runs middlewares in registration order around the handler", async () => {
      const server = new TestServer();
      const order: string[] = [];
      server.callAddMiddleware(async (_call: any, next: any) => {
        order.push("custom-before");
        const r = await next();
        order.push("custom-after");
        return r;
      });
      const handler = jest.fn((_call, cb) => {
        order.push("handler");
        cb(null, {});
      });
      const wrapped = server.callWrapHandler(handler);

      await wrapped(makeCall(), jest.fn());

      // grpcApiRequestLogger (default #1) -> tenantContextMiddleware (default #2) -> custom -> handler
      expect(order).toEqual(["custom-before", "handler", "custom-after"]);
      expect(grpcApiRequestLogger).toHaveBeenCalled();
    });

    it("wires the tenant context from x-tenant-id/x-tenant-db-name metadata into runWithTenant", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(null, {}));
      const wrapped = server.callWrapHandler(handler);
      const call = makeCall({
        "x-tenant-id": "t1",
        "x-tenant-db-name": "hrms-acme",
      });

      await wrapped(call, jest.fn());

      expect(getClientForDb).toHaveBeenCalledWith("hrms-acme");
      expect(runWithTenant).toHaveBeenCalledWith(
        "t1",
        { __tenantClient: true },
        expect.any(Function),
        undefined,
      );
    });

    it("forwards actor metadata into runWithTenant when x-actor-user-id is present", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(null, {}));
      const wrapped = server.callWrapHandler(handler);
      const call = makeCall({
        "x-tenant-id": "t1",
        "x-actor-user-id": "u1",
        "x-actor-username": "jdoe",
        "x-actor-ip": "1.2.3.4",
        "x-actor-user-agent": "jest",
      });

      await wrapped(call, jest.fn());

      expect(runWithTenant).toHaveBeenCalledWith(
        "t1",
        null,
        expect.any(Function),
        {
          userId: "u1",
          username: "jdoe",
          ipAddress: "1.2.3.4",
          userAgent: "jest",
        },
      );
    });

    it("skips tenant context entirely when x-tenant-id is absent", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(null, {}));
      const wrapped = server.callWrapHandler(handler);

      await wrapped(makeCall(), jest.fn());

      expect(runWithTenant).not.toHaveBeenCalled();
    });

    it("resolves without a tenant client when x-tenant-db-name is absent", async () => {
      const server = new TestServer();
      const handler = jest.fn((_call, cb) => cb(null, {}));
      const wrapped = server.callWrapHandler(handler);
      const call = makeCall({ "x-tenant-id": "t1" });

      await wrapped(call, jest.fn());

      expect(getClientForDb).not.toHaveBeenCalled();
      expect(runWithTenant).toHaveBeenCalledWith(
        "t1",
        null,
        expect.any(Function),
        undefined,
      );
    });
  });

  describe("addService", () => {
    it("lowercases the first letter of each proto method name before registering", () => {
      const server = new TestServer();
      const impl = { GetLeaves: jest.fn((_c, cb) => cb(null, {})) };
      server.callAddService({} as any, impl);

      expect(mockServerInstance.addService).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ getLeaves: expect.any(Function) }),
      );
    });
  });

  describe("wrapWithValidation", () => {
    it("calls the handler when validation passes", async () => {
      const server = new TestServer();
      const handler = jest.fn();
      const schema = { safeParse: () => ({ success: true, data: {} }) };
      const wrapped = server.callWrapWithValidation(handler, schema);

      await wrapped(makeCall(), jest.fn());

      expect(handler).toHaveBeenCalled();
    });

    it("calls back with the error (not the handler) when validation fails", async () => {
      const server = new TestServer();
      const handler = jest.fn();
      const schema = {
        safeParse: () => ({
          success: false,
          error: { errors: [{ message: "bad" }] },
        }),
      };
      const wrapped = server.callWrapWithValidation(handler, schema);
      const callback = jest.fn();

      await wrapped(makeCall(), callback);

      expect(handler).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(null, expect.anything());
    });
  });

  describe("start / stop", () => {
    it("binds using the provided credentials when given", () => {
      const server = new TestServer();
      const creds: any = { __explicit: true };
      server.start("localhost:50099", creds);
      expect(mockServerInstance.bindAsync).toHaveBeenCalledWith(
        "localhost:50099",
        creds,
        expect.any(Function),
      );
    });

    it("builds server credentials from cert files when none are provided", () => {
      const server = new TestServer();
      server.start("localhost:50099");
      expect(mockServerInstance.bindAsync).toHaveBeenCalledWith(
        "localhost:50099",
        { __serverCreds: true },
        expect.any(Function),
      );
    });

    it("warms the database connection once the server is bound", () => {
      const { warmUpDatabase } = jest.requireMock("@hrms/db");
      new TestServer().start("localhost:50099", {} as any);
      expect(warmUpDatabase).toHaveBeenCalledTimes(1);
    });

    it("does not warm up when binding fails", () => {
      const { warmUpDatabase } = jest.requireMock("@hrms/db");
      mockServerInstance.bindAsync.mockImplementationOnce(
        (_a: string, _c: any, cb: (err: Error | null) => void) =>
          cb(new Error("port in use")),
      );
      new TestServer().start("localhost:50099", {} as any);
      expect(warmUpDatabase).not.toHaveBeenCalled();
    });

    it("stop() resolves when tryShutdown succeeds", async () => {
      const server = new TestServer();
      await expect(server.stop()).resolves.toBeUndefined();
    });

    it("stop() rejects when tryShutdown reports an error", async () => {
      mockServerInstance.tryShutdown.mockImplementationOnce((cb: any) =>
        cb(new Error("shutdown failed")),
      );
      const server = new TestServer();
      await expect(server.stop()).rejects.toThrow("shutdown failed");
    });
  });
});
