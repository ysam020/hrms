/**
 * auth-service's tenant policy, through the real AuthServer and
 * BaseGrpcServer middleware (only the gRPC transport and the handler bodies
 * are stubbed): the seven traced login/session methods run without a
 * tenant even under GRPC_REQUIRE_TENANT=true, so enabling enforcement
 * can't lock anyone out; everything else still requires a valid tenant.
 */
const mockImpls: Record<string, (call: any, cb: any) => Promise<void>> = {};
jest.mock("@grpc/grpc-js", () => {
  const actual = jest.requireActual("@grpc/grpc-js");
  return {
    ...actual,
    Server: jest.fn().mockImplementation(() => ({
      addService: (_svc: unknown, impl: Record<string, any>) =>
        Object.assign(mockImpls, impl),
      bindAsync: jest.fn(),
      tryShutdown: jest.fn(),
      forceShutdown: jest.fn(),
    })),
  };
});

const mockHandlerCalls: string[] = [];
jest.mock("../handlers", () => {
  const names = [
    "RefreshToken",
    "Logout",
    "GetProfile",
    "WebAuthnRegistrationOptions",
    "WebAuthnRegistrationVerify",
    "WebAuthnAuthenticationOptions",
    "WebAuthnAuthenticationVerify",
    "GoogleOAuthCallback",
  ];
  return {
    handlers: Object.fromEntries(
      names.map((n) => [
        n,
        (_call: any, cb: any) => {
          mockHandlerCalls.push(n);
          cb(null, { ok: n });
        },
      ]),
    ),
  };
});

jest.mock("@hrms/db", () => ({
  runWithTenant: jest.fn((_t: string, _c: unknown, fn: () => unknown) => fn()),
  getClientForDb: jest.fn(() => ({})),
  withQueryStats: (fn: () => unknown) => fn(),
  currentQueryStats: () => undefined,
  summarizeQueryStats: jest.fn(),
  warmUpDatabase: jest.fn(),
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  grpcApiRequestLogger: (_call: any, next: () => Promise<any>) => next(),
}));

import { runWithTenant } from "@hrms/db";
import { AuthServer, TENANT_OPTIONAL_AUTH_METHODS } from "../index";

const TENANT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const UNAUTHENTICATED = 16;

const camel = (rpc: string) => rpc.charAt(0).toLowerCase() + rpc.slice(1);

function call(path: string, meta: Record<string, string> = {}) {
  return {
    getPath: () => path,
    metadata: { get: (k: string) => (meta[k] ? [meta[k]] : []) },
    request: {},
  };
}

async function invoke(rpc: string, meta: Record<string, string> = {}) {
  const callback = jest.fn();
  await mockImpls[camel(rpc)](call(`/auth.AuthService/${rpc}`, meta), callback);
  return callback.mock.calls[0];
}

const TENANT_OPTIONAL = [
  "RefreshToken",
  "WebAuthnAuthenticationOptions",
  "WebAuthnAuthenticationVerify",
  "GoogleOAuthCallback",
  "Logout",
  "WebAuthnRegistrationOptions",
  "WebAuthnRegistrationVerify",
];

describe("auth-service tenant policy", () => {
  beforeAll(() => {
    new AuthServer();
  });
  beforeEach(() => {
    mockHandlerCalls.length = 0;
    (runWithTenant as jest.Mock).mockClear();
  });
  afterEach(() => {
    delete process.env.GRPC_REQUIRE_TENANT;
  });

  it("lists exactly the seven traced methods — not every auth-service method", () => {
    expect([...TENANT_OPTIONAL_AUTH_METHODS].sort()).toEqual(
      TENANT_OPTIONAL.map((m) => `/auth.AuthService/${m}`).sort(),
    );
    expect(TENANT_OPTIONAL_AUTH_METHODS).not.toContain(
      "/auth.AuthService/GetProfile",
    );
  });

  describe.each([
    ["enforcement off", undefined],
    ["GRPC_REQUIRE_TENANT=true", "true"],
  ])("%s", (_label, flag) => {
    beforeEach(() => {
      if (flag) process.env.GRPC_REQUIRE_TENANT = flag;
    });

    it.each(TENANT_OPTIONAL)(
      "%s runs without a tenant (login, refresh, passkey and Google sign-in stay available)",
      async (rpc) => {
        const [err, response] = await invoke(rpc);
        expect(err).toBeNull();
        expect(response).toEqual({ ok: rpc });
        expect(runWithTenant).not.toHaveBeenCalled();
      },
    );

    it("runs a tenant-optional method inside the tenant when the gateway sends a valid one", async () => {
      const [err] = await invoke("Logout", {
        "x-tenant-id": TENANT,
        "x-tenant-db-name": "hrms-acme",
      });
      expect(err).toBeNull();
      expect(runWithTenant).toHaveBeenCalledWith(
        TENANT,
        expect.anything(),
        expect.any(Function),
        undefined,
      );
    });

    it("runs the health check without a tenant", async () => {
      const callback = jest.fn();
      await mockImpls.check(call("/health.HealthService/Check"), callback);
      expect(callback.mock.calls[0][0]).toBeNull();
    });
  });

  it("still requires a tenant for GetProfile (no blanket auth-service exemption) under enforcement", async () => {
    process.env.GRPC_REQUIRE_TENANT = "true";
    const [err] = await invoke("GetProfile");
    expect(err).toMatchObject({ code: UNAUTHENTICATED });
    expect(mockHandlerCalls).not.toContain("GetProfile");
  });

  it("rejects a malformed tenant id even on a tenant-optional method, under enforcement", async () => {
    process.env.GRPC_REQUIRE_TENANT = "true";
    const [err] = await invoke("Logout", {
      "x-tenant-id": "not-an-objectid",
      "x-tenant-db-name": "hrms-acme",
    });
    expect(err).toMatchObject({ code: UNAUTHENTICATED });
    expect(mockHandlerCalls).toEqual([]);
  });

  it("rejects a tenant without its database even on a tenant-optional method, under enforcement (no master fallback)", async () => {
    process.env.GRPC_REQUIRE_TENANT = "true";
    const [err] = await invoke("WebAuthnRegistrationOptions", {
      "x-tenant-id": TENANT,
    });
    expect(err).toMatchObject({ code: UNAUTHENTICATED });
    expect(mockHandlerCalls).toEqual([]);
  });
});
