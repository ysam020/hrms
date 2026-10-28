const mockDb = {
  tenant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  mcpGrant: { findMany: jest.fn(), findFirst: jest.fn() },
};
jest.mock("@hrms/db", () => ({ prisma: mockDb }));
jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.status(status).json(data),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockOauth = {
  loadAuthRequest: jest.fn(),
  takeAuthRequest: jest.fn(),
  issueAuthCode: jest.fn(),
  deniedRedirect: jest.fn(() => "https://claude.ai/cb?error=access_denied"),
  revokeGrant: jest.fn(),
};
jest.mock("../mcp/oauth", () => mockOauth);

import {
  approveConnectionRequest,
  getConnectionRequest,
  listConnections,
  revokeConnection,
} from "../mcp/consent";

const REQ_ID = "a".repeat(43);
const pending = {
  clientId: "mcp_abc",
  clientName: "Claude",
  clientUri: null,
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  codeChallenge: "c".repeat(43),
  scopes: ["profile:read", "leave:read", "payroll:read"],
  state: "s",
};
const user = {
  userId: "507f1f77bcf86cd799439011",
  tenantId: "507f1f77bcf86cd799439022",
};

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const req = (over: any = {}) =>
  ({
    user,
    params: { requestId: REQ_ID },
    body: {},
    headers: {},
    ip: "1.2.3.4",
    ...over,
  }) as any;

describe("consent screen", () => {
  it("shows the client, where it redirects, the organisation and scopes (payroll off by default)", async () => {
    mockOauth.loadAuthRequest.mockResolvedValue(pending);
    mockDb.tenant.findUnique.mockResolvedValue({ name: "Acme" });
    const res = makeRes();
    await getConnectionRequest(req(), res);
    const data = res.json.mock.calls[0][0].data;
    expect(data).toMatchObject({
      clientName: "Claude",
      redirectHost: "claude.ai",
      organisation: "Acme",
    });
    expect(
      data.scopes.find((s: any) => s.scope === "payroll:read").defaultOn,
    ).toBe(false);
    expect(
      data.scopes.find((s: any) => s.scope === "profile:read").defaultOn,
    ).toBe(true);
  });

  it("an unknown or malformed request id is not found", async () => {
    mockOauth.loadAuthRequest.mockResolvedValue(null);
    const res = makeRes();
    await getConnectionRequest(req({ params: { requestId: "../../x" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockOauth.loadAuthRequest).not.toHaveBeenCalled();
  });

  it("approval binds the grant to the session's user and tenant, never the body's", async () => {
    mockOauth.takeAuthRequest.mockResolvedValue(pending);
    mockOauth.issueAuthCode.mockResolvedValue("https://claude.ai/cb?code=x");
    const res = makeRes();
    await approveConnectionRequest(
      req({
        body: {
          scopes: ["profile:read"],
          userId: "507f1f77bcf86cd799439099",
          tenantId: "507f1f77bcf86cd799439098",
        },
      }),
      res,
    );
    expect(mockOauth.issueAuthCode).toHaveBeenCalledWith(
      pending,
      ["profile:read"],
      user,
    );
  });

  it("can only narrow what the assistant asked for", async () => {
    mockOauth.takeAuthRequest.mockResolvedValue({
      ...pending,
      scopes: ["profile:read"],
    });
    mockOauth.issueAuthCode.mockResolvedValue("https://claude.ai/cb?code=x");
    const res = makeRes();
    await approveConnectionRequest(
      req({ body: { scopes: ["profile:read", "payroll:read"] } }),
      res,
    );
    expect(mockOauth.issueAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      ["profile:read"],
      user,
    );
  });

  it.each([[[]], [["admin:all"]], ["profile:read"], [undefined]])(
    "rejects scopes %j",
    async (scopes) => {
      const res = makeRes();
      await approveConnectionRequest(req({ body: { scopes } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockOauth.takeAuthRequest).not.toHaveBeenCalled();
    },
  );
});

describe("connected assistants", () => {
  it("lists only the caller's own grants in the current organisation", async () => {
    mockDb.mcpGrant.findMany.mockResolvedValue([]);
    process.env.MCP_ISSUER_URL = "https://api.test";
    const res = makeRes();
    await listConnections(req(), res);
    // The address to give an assistant comes from the gateway itself.
    expect(res.json.mock.calls[0][0].data).toEqual({
      mcpUrl: "https://api.test/mcp",
      connections: [],
    });
    expect(mockDb.mcpGrant.findMany.mock.calls[0][0].where).toMatchObject({
      userId: user.userId,
      tenantId: user.tenantId,
      revokedAt: null,
    });
  });

  it("someone else's grant id is simply not found", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await revokeConnection(
      req({ params: { grantId: "507f1f77bcf86cd799439033" } }),
      res,
    );
    expect(mockDb.mcpGrant.findFirst.mock.calls[0][0].where).toEqual({
      id: "507f1f77bcf86cd799439033",
      userId: user.userId,
      tenantId: user.tenantId,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockOauth.revokeGrant).not.toHaveBeenCalled();
  });

  it("revokes the caller's own grant", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValue({
      id: "507f1f77bcf86cd799439033",
    });
    mockDb.user.findUnique.mockResolvedValue({ username: "psharma" });
    const res = makeRes();
    await revokeConnection(
      req({ params: { grantId: "507f1f77bcf86cd799439033" } }),
      res,
    );
    expect(mockOauth.revokeGrant).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439033",
      "user_revoked",
      expect.objectContaining({ username: "psharma" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
