import jwt from "jsonwebtoken";

const mockDb = {
  mcpGrant: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  tenantMembership: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
};
jest.mock("@hrms/db", () => ({
  prisma: mockDb,
  runWithTenant: jest.fn((_t: any, _c: any, fn: any) => fn()),
  getClientForDb: jest.fn(() => ({})),
}));
jest.mock("@hrms/common", () => ({
  BLOCKED_EMPLOYEE_STATUSES: ["Terminated", "Absconded", "Resigned"],
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockSubscription = jest.fn();
jest.mock("../middleware/requireActiveSubscription", () => ({
  getSubscriptionAccess: (...a: any[]) => mockSubscription(...a),
}));

process.env.ACCESS_JWT_TOKEN = "test-web-secret";
process.env.MCP_ISSUER_URL = "https://api.test";

import {
  authenticateMcpRequest,
  signMcpAccessToken,
  verifyMcpAccessToken,
  McpAuthError,
} from "../mcp/principal";

const USER = "507f1f77bcf86cd799439011";
const TENANT = "507f1f77bcf86cd799439022";
const GRANT = "507f1f77bcf86cd799439033";

const claims = {
  sub: USER,
  tid: TENANT,
  gid: GRANT,
  cid: "mcp_client",
  scope: "profile:read leave:read",
};
const bearer = (t: string) => `Bearer ${t}`;
const validToken = () => signMcpAccessToken(claims, 3600);

const activeGrant = (over: Record<string, unknown> = {}) => ({
  id: GRANT,
  userId: USER,
  tenantId: TENANT,
  clientId: "mcp_client",
  clientName: "Claude",
  scopes: ["profile:read", "leave:read"],
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000),
  lastUsedAt: new Date(),
  ...over,
});

const expectAuthError = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(McpAuthError);
  await expect(p).rejects.toMatchObject({ code });
};

beforeEach(() => {
  mockDb.mcpGrant.findUnique.mockResolvedValue(activeGrant());
  mockDb.mcpGrant.update.mockResolvedValue({});
  mockDb.user.findUnique.mockResolvedValue({
    username: "psharma",
    employeeStatus: "Active",
  });
  mockDb.tenantMembership.findUnique.mockResolvedValue({ role: "employee" });
  mockDb.tenant.findUnique.mockResolvedValue({
    isActive: true,
    dbName: "hrms-acme",
  });
  mockSubscription.mockResolvedValue({ allowed: true });
});

describe("MCP access tokens", () => {
  it("are bound to this issuer and the /mcp audience", () => {
    const decoded: any = jwt.decode(validToken());
    expect(decoded.iss).toBe("https://api.test");
    expect(decoded.aud).toBe("https://api.test/mcp");
    expect(decoded.token_use).toBe("mcp");
  });

  it("are not valid web session tokens, and web tokens are not MCP tokens", () => {
    // The web API verifies with ACCESS_JWT_TOKEN directly.
    expect(() =>
      jwt.verify(validToken(), process.env.ACCESS_JWT_TOKEN!, {
        algorithms: ["HS256"],
      }),
    ).toThrow();
    const webToken = jwt.sign(
      { userId: USER, tenantId: TENANT },
      process.env.ACCESS_JWT_TOKEN!,
      { algorithm: "HS256" },
    );
    expect(verifyMcpAccessToken(webToken)).toBeNull();
  });

  it("reject a token for another audience or issuer", () => {
    const key = require("../mcp/config").mcpSigningKey();
    const wrongAud = jwt.sign({ ...claims, token_use: "mcp" }, key, {
      algorithm: "HS256",
      issuer: "https://api.test",
      audience: "https://elsewhere/mcp",
    });
    const wrongIss = jwt.sign({ ...claims, token_use: "mcp" }, key, {
      algorithm: "HS256",
      issuer: "https://evil",
      audience: "https://api.test/mcp",
    });
    expect(verifyMcpAccessToken(wrongAud)).toBeNull();
    expect(verifyMcpAccessToken(wrongIss)).toBeNull();
  });

  it("reject an alg=none token", () => {
    const unsigned = jwt.sign({ ...claims, token_use: "mcp" }, "", {
      algorithm: "none" as any,
    });
    expect(verifyMcpAccessToken(unsigned)).toBeNull();
  });
});

describe("authenticateMcpRequest", () => {
  it("resolves identity from the grant, with the current membership role", async () => {
    mockDb.tenantMembership.findUnique.mockResolvedValue({ role: "manager" });
    const p = await authenticateMcpRequest(bearer(validToken()));
    expect(p).toMatchObject({
      userId: USER,
      tenantId: TENANT,
      tenantRole: "manager",
      dbName: "hrms-acme",
      grantId: GRANT,
      clientName: "Claude",
    });
    expect([...p.scopes].sort()).toEqual(["leave:read", "profile:read"]);
  });

  it("rejects a missing or non-Bearer header", async () => {
    await expectAuthError(authenticateMcpRequest(undefined), "invalid_token");
    await expectAuthError(
      authenticateMcpRequest(`Basic ${validToken()}`),
      "invalid_token",
    );
  });

  it("rejects an expired token", async () => {
    const expired = signMcpAccessToken(claims, -10);
    await expectAuthError(
      authenticateMcpRequest(bearer(expired)),
      "invalid_token",
    );
  });

  it("rejects a tampered token", async () => {
    const [h, , sig] = validToken().split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims, sub: "507f1f77bcf86cd799439099" }),
    ).toString("base64url");
    await expectAuthError(
      authenticateMcpRequest(bearer(`${h}.${forged}.${sig}`)),
      "invalid_token",
    );
  });

  it("rejects a revoked grant immediately, even with an unexpired token", async () => {
    mockDb.mcpGrant.findUnique.mockResolvedValue(
      activeGrant({ revokedAt: new Date() }),
    );
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "invalid_token",
    );
  });

  it("rejects an expired grant", async () => {
    mockDb.mcpGrant.findUnique.mockResolvedValue(
      activeGrant({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "invalid_token",
    );
  });

  it.each([
    ["user", { userId: "507f1f77bcf86cd799439099" }],
    ["tenant", { tenantId: "507f1f77bcf86cd799439098" }],
    ["client", { clientId: "mcp_other" }],
  ])("rejects a token whose %s doesn't match its grant", async (_l, over) => {
    mockDb.mcpGrant.findUnique.mockResolvedValue(activeGrant(over));
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "invalid_token",
    );
  });

  it.each(["Terminated", "Absconded", "Resigned"])(
    "rejects a %s employee on every call",
    async (employeeStatus) => {
      mockDb.user.findUnique.mockResolvedValue({
        username: "x",
        employeeStatus,
      });
      await expectAuthError(
        authenticateMcpRequest(bearer(validToken())),
        "invalid_token",
      );
    },
  );

  it("rejects someone who has left the organisation", async () => {
    mockDb.tenantMembership.findUnique.mockResolvedValue(null);
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "invalid_token",
    );
  });

  it("rejects an inactive organisation", async () => {
    mockDb.tenant.findUnique.mockResolvedValue({
      isActive: false,
      dbName: "hrms-acme",
    });
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "invalid_token",
    );
  });

  it("refuses (403-style) when the organisation's subscription has lapsed", async () => {
    mockSubscription.mockResolvedValue({
      allowed: false,
      message: "Your subscription has expired.",
    });
    await expectAuthError(
      authenticateMcpRequest(bearer(validToken())),
      "access_denied",
    );
  });

  it("never grants more scopes than the grant holds, whatever the token says", async () => {
    mockDb.mcpGrant.findUnique.mockResolvedValue(
      activeGrant({ scopes: ["profile:read"] }),
    );
    const token = signMcpAccessToken(
      { ...claims, scope: "profile:read payroll:read admin:all" },
      3600,
    );
    const p = await authenticateMcpRequest(bearer(token));
    expect([...p.scopes]).toEqual(["profile:read"]);
  });
});
