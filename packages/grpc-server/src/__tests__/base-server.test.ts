import { runWithTenant, getClientForDb } from "@hrms/db";
import { grpcApiRequestLogger } from "@hrms/logger";
import { BaseGrpcServer } from "../base-server";

const mockServerInstance = {
  addService: jest.fn(),
  bindAsync: jest.fn(
    (_addr: string, _creds: any, cb: (err: Error | null) => void) => cb(null),
  ),
  tryShutdown: jest.fn((cb: (err?: Error) => void) => cb()),
  forceShutdown: jest.fn(),
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

    describe("calls without a tenant", () => {
      const { logger } = jest.requireMock("@hrms/logger");
      const tenantless = (path: string) => ({
        ...makeCall(),
        getPath: () => path,
      });
      afterEach(() => {
        delete process.env.GRPC_REQUIRE_TENANT;
      });

      it("still runs them by default, logging each method once", async () => {
        const server = new TestServer();
        const handler = jest.fn((_call, cb) => cb(null, { ok: true }));
        const wrapped = server.callWrapHandler(handler);
        const callback = jest.fn();

        await wrapped(tenantless("/svc.A/List"), callback);
        await wrapped(tenantless("/svc.A/List"), jest.fn());
        await wrapped(tenantless("/svc.A/Get"), jest.fn());

        expect(callback).toHaveBeenCalledWith(null, { ok: true });
        const warned = logger.warn.mock.calls.filter(
          ([msg]: [string]) => msg === "gRPC call without tenant context",
        );
        expect(warned.map(([, meta]: [string, any]) => meta.method)).toEqual([
          "/svc.A/List",
          "/svc.A/Get",
        ]);
      });

      it("rejects them as UNAUTHENTICATED, without running the handler, when GRPC_REQUIRE_TENANT=true", async () => {
        process.env.GRPC_REQUIRE_TENANT = "true";
        const server = new TestServer();
        const handler = jest.fn((_call, cb) => cb(null, {}));
        const wrapped = server.callWrapHandler(handler);
        const callback = jest.fn();

        await wrapped(tenantless("/svc.B/List"), callback);

        expect(handler).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({ code: 16 }), // UNAUTHENTICATED
          null,
        );
      });

      const withMeta = (path: string, meta: Record<string, string>) => ({
        ...makeCall(meta),
        getPath: () => path,
      });
      const VALID = "aaaaaaaaaaaaaaaaaaaaaaaa";

      it("reports a tenant without a tenant database (it would fall back to the master database)", async () => {
        const handler = jest.fn((_call, cb) => cb(null, {}));
        await new TestServer().callWrapHandler(handler)(
          withMeta("/svc.C/List", { "x-tenant-id": VALID }),
          jest.fn(),
        );
        expect(logger.warn).toHaveBeenCalledWith(
          "gRPC call with a tenant but no tenant database",
          { method: "/svc.C/List" },
        );
      });

      it("rejects a malformed tenant id or a missing tenant database when GRPC_REQUIRE_TENANT=true", async () => {
        process.env.GRPC_REQUIRE_TENANT = "true";
        const handler = jest.fn((_call, cb) => cb(null, {}));
        const wrapped = new TestServer().callWrapHandler(handler);
        const malformed = jest.fn();
        const noDb = jest.fn();

        await wrapped(
          withMeta("/svc.D/Get", {
            "x-tenant-id": "not-an-id",
            "x-tenant-db-name": "hrms-acme",
          }),
          malformed,
        );
        await wrapped(withMeta("/svc.D/Get", { "x-tenant-id": VALID }), noDb);

        expect(handler).not.toHaveBeenCalled();
        expect(malformed).toHaveBeenCalledWith(
          expect.objectContaining({ code: 16 }),
          null,
        );
        expect(noDb).toHaveBeenCalledWith(
          expect.objectContaining({ code: 16 }),
          null,
        );
      });

      it("accepts a valid tenant with its database under GRPC_REQUIRE_TENANT=true", async () => {
        process.env.GRPC_REQUIRE_TENANT = "true";
        const handler = jest.fn((_call, cb) => cb(null, { ok: true }));
        const callback = jest.fn();
        await new TestServer().callWrapHandler(handler)(
          withMeta("/svc.E/Get", {
            "x-tenant-id": VALID,
            "x-tenant-db-name": "hrms-acme",
          }),
          callback,
        );
        expect(callback).toHaveBeenCalledWith(null, { ok: true });
      });

      it("lets a method declared platform-level run without a tenant, unreported, even under GRPC_REQUIRE_TENANT=true", async () => {
        process.env.GRPC_REQUIRE_TENANT = "true";
        class PlatformServer extends TestServer {
          constructor() {
            super();
            this.allowWithoutTenant("/auth.AuthService/Login");
          }
        }
        const server = new PlatformServer();
        const handler = jest.fn((_call, cb) => cb(null, { ok: true }));
        const allowed = jest.fn();
        const other = jest.fn();
        await server.callWrapHandler(handler)(
          tenantless("/auth.AuthService/Login"),
          allowed,
        );
        await server.callWrapHandler(handler)(
          tenantless("/auth.AuthService/ListUsers"),
          other,
        );

        expect(allowed).toHaveBeenCalledWith(null, { ok: true });
        expect(runWithTenant).not.toHaveBeenCalled();
        expect(other).toHaveBeenCalledWith(
          expect.objectContaining({ code: 16 }),
          null,
        );
      });

      it("never affects calls that carry a complete tenant context", async () => {
        process.env.GRPC_REQUIRE_TENANT = "true";
        const server = new TestServer();
        const handler = jest.fn((_call, cb) => cb(null, { ok: true }));
        const callback = jest.fn();
        await server.callWrapHandler(handler)(
          makeCall({
            "x-tenant-id": "bbbbbbbbbbbbbbbbbbbbbbbb",
            "x-tenant-db-name": "hrms-acme",
          }),
          callback,
        );
        expect(callback).toHaveBeenCalledWith(null, { ok: true });
      });
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

  describe("stop", () => {
    afterEach(() => {
      jest.useRealTimers();
      mockServerInstance.tryShutdown.mockImplementation(
        (cb: (err?: Error) => void) => cb(),
      );
    });

    it("resolves once in-flight calls finish, without forcing", async () => {
      await expect(new TestServer().stop(5000)).resolves.toBeUndefined();
      expect(mockServerInstance.forceShutdown).not.toHaveBeenCalled();
    });

    it("cancels calls still in flight after the timeout and rejects", async () => {
      jest.useFakeTimers();
      mockServerInstance.tryShutdown.mockImplementation(() => undefined);
      const stopping = new TestServer().stop(3000);
      jest.advanceTimersByTime(3000);
      await expect(stopping).rejects.toThrow(/still in flight after 3000 ms/);
      expect(mockServerInstance.forceShutdown).toHaveBeenCalled();
    });
  });
});
