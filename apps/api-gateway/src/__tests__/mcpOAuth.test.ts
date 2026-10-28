import { createHash, randomBytes } from "node:crypto";

// In-memory Redis with the three commands the OAuth store uses.
const mockRedisData = new Map<string, string>();
const mockRedis = {
  set: jest.fn(async (k: string, v: string) => {
    mockRedisData.set(k, v);
    return "OK";
  }),
  get: jest.fn(async (k: string) => mockRedisData.get(k) ?? null),
  getdel: jest.fn(async (k: string) => {
    const v = mockRedisData.get(k) ?? null;
    mockRedisData.delete(k);
    return v;
  }),
};
jest.mock("@hrms/cache", () => ({ getRedisClient: () => mockRedis }));

const mockDb = {
  mcpOAuthClient: { create: jest.fn(), findUnique: jest.fn() },
  mcpGrant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  tenant: { findUnique: jest.fn() },
};
jest.mock("@hrms/db", () => ({ prisma: mockDb }));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../mcp/audit", () => ({ recordMcpAudit: jest.fn() }));

const mockLoadAccount = jest.fn();
jest.mock("../mcp/principal", () => {
  const actual = jest.requireActual("../mcp/principal");
  return {
    ...actual,
    loadAccountContext: (...a: any[]) => mockLoadAccount(...a),
  };
});

process.env.ACCESS_JWT_TOKEN = "test-web-secret";
process.env.MCP_ISSUER_URL = "https://api.test";
process.env.CLIENT_URL = "https://app.test";

import {
  authorize,
  issueAuthCode,
  redirectUriMatches,
  registerClient,
  revoke,
  takeAuthRequest,
  token,
} from "../mcp/oauth";
import { McpAuthError, verifyMcpAccessToken } from "../mcp/principal";
import { recordMcpAudit } from "../mcp/audit";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CLIENT = {
  clientId: "mcp_abc",
  clientName: "Claude",
  clientUri: null,
  redirectUris: [REDIRECT],
  createdAt: new Date(),
};
const USER = "507f1f77bcf86cd799439011";
const TENANT = "507f1f77bcf86cd799439022";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const makeRes = () => {
  const res: any = { headers: {} as Record<string, string> };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.type = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.end = jest.fn(() => res);
  res.redirect = jest.fn((_code: number, url: string) => {
    res.location = url;
    return res;
  });
  res.setHeader = jest.fn((k: string, v: string) => (res.headers[k] = v));
  return res;
};

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
};

beforeEach(() => {
  mockRedisData.clear();
  mockDb.mcpOAuthClient.findUnique.mockResolvedValue(CLIENT);
  mockLoadAccount.mockResolvedValue({
    tenantRole: "employee",
    dbName: "hrms-acme",
    username: "psharma",
  });
  mockDb.mcpGrant.create.mockImplementation(async ({ data }: any) => ({
    id: "507f1f77bcf86cd799439033",
    ...data,
  }));
});

describe("dynamic client registration", () => {
  const register = async (body: any) => {
    mockDb.mcpOAuthClient.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      createdAt: new Date(),
    }));
    const res = makeRes();
    await registerClient({ body } as any, res);
    return res;
  };

  it("registers a public client, whatever auth method it asked for", async () => {
    const res = await register({
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "client_secret_post",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.client_id).toMatch(/^mcp_/);
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(body).not.toHaveProperty("client_secret");
  });

  it.each([
    [["javascript:alert(1)"]],
    [["http://evil.example/cb"]],
    [["https://ok.example/cb#frag"]],
    [["data:text/html,hi"]],
    [[]],
    ["https://not-an-array.example"],
  ])("rejects redirect_uris %j", async (redirect_uris) => {
    const res = await register({ redirect_uris });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.mcpOAuthClient.create).not.toHaveBeenCalled();
  });

  it("accepts https, loopback http and reverse-domain app schemes", async () => {
    const res = await register({
      redirect_uris: [
        "https://chatgpt.com/connector_platform_oauth_redirect",
        "http://127.0.0.1:6274/oauth/callback",
        "com.example.app:/oauth",
      ],
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("refuses grant types other than authorization_code / refresh_token", async () => {
    const res = await register({
      redirect_uris: [REDIRECT],
      grant_types: ["client_credentials"],
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("redirect URI matching", () => {
  it("is exact, except a loopback URI may change port", () => {
    expect(redirectUriMatches([REDIRECT], REDIRECT)).toBe(true);
    expect(redirectUriMatches([REDIRECT], `${REDIRECT}/x`)).toBe(false);
    expect(redirectUriMatches([REDIRECT], "https://claude.ai.evil/api")).toBe(
      false,
    );
    expect(
      redirectUriMatches(
        ["http://127.0.0.1:1000/cb"],
        "http://127.0.0.1:5555/cb",
      ),
    ).toBe(true);
    expect(
      redirectUriMatches(
        ["http://127.0.0.1:1000/cb"],
        "http://127.0.0.1:5555/other",
      ),
    ).toBe(false);
  });
});

describe("GET /oauth/authorize", () => {
  const authz = async (query: Record<string, string>) => {
    const res = makeRes();
    await authorize({ query } as any, res);
    return res;
  };
  const valid = () => ({
    response_type: "code",
    client_id: CLIENT.clientId,
    redirect_uri: REDIRECT,
    code_challenge: pkce().challenge,
    code_challenge_method: "S256",
    state: "xyz",
  });

  it("parks the request and sends the browser to the web consent screen", async () => {
    const res = await authz(valid());
    expect(res.location).toMatch(
      /^https:\/\/app\.test\/connect\/authorize\/[\w-]{20,}$/,
    );
    expect(mockRedisData.size).toBe(1);
  });

  it("never redirects to an unregistered redirect_uri", async () => {
    const res = await authz({ ...valid(), redirect_uri: "https://evil/cb" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("never redirects for an unknown client", async () => {
    mockDb.mcpOAuthClient.findUnique.mockResolvedValue(null);
    const res = await authz(valid());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["missing PKCE", { code_challenge: "" }],
    ["plain PKCE", { code_challenge_method: "plain" }],
    ["implicit flow", { response_type: "token" }],
    ["foreign resource", { resource: "https://other/mcp" }],
  ])("bounces %s back to the client as an error", async (_l, over) => {
    const res = await authz({ ...valid(), ...over });
    expect(res.location).toMatch(/^https:\/\/claude\.ai\/.*error=/);
    expect(res.location).toContain("state=xyz");
    expect(mockRedisData.size).toBe(0);
  });

  it("drops unknown scopes and defaults to all known ones", async () => {
    await authz({ ...valid(), scope: "openid offline_access" });
    const [pending] = [...mockRedisData.values()].map((v) => JSON.parse(v));
    expect(pending.scopes).toEqual([
      "profile:read",
      "leave:read",
      "attendance:read",
      "payroll:read",
      "org:read",
    ]);
  });
});

/** Runs authorize → consent → code; returns what the token call needs. */
async function codeFor(scopes = ["profile:read"]) {
  const { verifier, challenge } = pkce();
  const res = makeRes();
  await authorize(
    {
      query: {
        response_type: "code",
        client_id: CLIENT.clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
    } as any,
    res,
  );
  const requestId = res.location.split("/connect/authorize/")[1];
  const pending = (await takeAuthRequest(requestId))!;
  const redirectTo = await issueAuthCode(pending, scopes as any, {
    userId: USER,
    tenantId: TENANT,
  });
  return { code: new URL(redirectTo).searchParams.get("code")!, verifier };
}

const callToken = async (body: any) => {
  const res = makeRes();
  await token({ body } as any, res);
  return { res, body: res.json.mock.calls[0]?.[0] };
};

describe("POST /oauth/token — authorization_code", () => {
  it("issues tokens for the user/tenant who approved, never request-supplied ones", async () => {
    const { code, verifier } = await codeFor(["profile:read", "org:read"]);
    const { body } = await callToken({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
      // Ignored: identity only ever comes from the approved code.
      user_id: "507f1f77bcf86cd799439099",
      tenant_id: "507f1f77bcf86cd799439098",
    });
    expect(body.token_type).toBe("Bearer");
    const claims = verifyMcpAccessToken(body.access_token)!;
    expect(claims.sub).toBe(USER);
    expect(claims.tid).toBe(TENANT);
    expect(claims.scope).toBe("profile:read org:read");
    // Only the hash of the refresh token is stored.
    const stored = mockDb.mcpGrant.create.mock.calls[0][0].data;
    expect(stored.refreshTokenHash).toBe(sha(body.refresh_token));
    expect(JSON.stringify(stored)).not.toContain(body.refresh_token);
    expect(recordMcpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CONNECT", userId: USER }),
    );
  });

  it("rejects a wrong PKCE verifier and burns the code", async () => {
    const { code, verifier } = await codeFor();
    const bad = await callToken({
      grant_type: "authorization_code",
      code,
      code_verifier: pkce().verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
    });
    expect(bad.body.error).toBe("invalid_grant");
    const retry = await callToken({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
    });
    expect(retry.body.error).toBe("invalid_grant");
  });

  it("a code works only once", async () => {
    const { code, verifier } = await codeFor();
    const body = {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
    };
    expect((await callToken(body)).body.access_token).toBeTruthy();
    expect((await callToken(body)).body.error).toBe("invalid_grant");
  });

  it.each([
    ["another client", { client_id: "mcp_other" }],
    ["another redirect_uri", { redirect_uri: "https://claude.ai/other" }],
  ])("rejects a code presented by %s", async (_l, over) => {
    const { code, verifier } = await codeFor();
    const { body } = await callToken({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
      ...over,
    });
    expect(body.error).toBe("invalid_grant");
  });

  it("refuses to create a grant for someone no longer allowed in", async () => {
    mockLoadAccount.mockRejectedValue(
      new McpAuthError("invalid_token", "This account can't sign in."),
    );
    const { code, verifier } = await codeFor();
    const { body } = await callToken({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
    });
    expect(body.error).toBe("invalid_grant");
    expect(mockDb.mcpGrant.create).not.toHaveBeenCalled();
  });

  it("sets no-store on token responses", async () => {
    const { res } = await callToken({ grant_type: "password" });
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.json.mock.calls[0][0].error).toBe("unsupported_grant_type");
  });
});

describe("POST /oauth/token — refresh_token", () => {
  const grant = (over: Record<string, unknown> = {}) => ({
    id: "507f1f77bcf86cd799439033",
    userId: USER,
    tenantId: TENANT,
    clientId: CLIENT.clientId,
    clientName: "Claude",
    scopes: ["profile:read"],
    refreshTokenHash: sha("rt-current"),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  });

  it("rotates the refresh token with a compare-and-swap", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValueOnce(grant());
    mockDb.mcpGrant.updateMany.mockResolvedValue({ count: 1 });
    const { body } = await callToken({
      grant_type: "refresh_token",
      refresh_token: "rt-current",
      client_id: CLIENT.clientId,
    });
    expect(body.refresh_token).not.toBe("rt-current");
    expect(mockDb.mcpGrant.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ refreshTokenHash: sha("rt-current") }),
      data: {
        refreshTokenHash: sha(body.refresh_token),
        prevRefreshTokenHash: sha("rt-current"),
      },
    });
  });

  it("loses the race cleanly when another refresh rotated first", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValueOnce(grant());
    mockDb.mcpGrant.updateMany.mockResolvedValue({ count: 0 });
    const { body } = await callToken({
      grant_type: "refresh_token",
      refresh_token: "rt-current",
      client_id: CLIENT.clientId,
    });
    expect(body.error).toBe("invalid_grant");
  });

  it("revokes the whole grant when a rotated-out token is reused", async () => {
    mockDb.mcpGrant.findFirst
      .mockResolvedValueOnce(null) // not the current token
      .mockResolvedValueOnce(grant({ prevRefreshTokenHash: sha("rt-old") }));
    mockDb.mcpGrant.updateMany.mockResolvedValue({ count: 1 });
    mockDb.mcpGrant.findUnique.mockResolvedValue(grant());
    mockDb.tenant.findUnique.mockResolvedValue({ dbName: "hrms-acme" });
    const { body } = await callToken({
      grant_type: "refresh_token",
      refresh_token: "rt-old",
      client_id: CLIENT.clientId,
    });
    expect(body.error).toBe("invalid_grant");
    expect(mockDb.mcpGrant.updateMany).toHaveBeenCalledWith({
      where: { id: grant().id, revokedAt: null },
      data: expect.objectContaining({ revokedReason: "refresh_token_reuse" }),
    });
  });

  it.each([
    ["another client", grant(), { client_id: "mcp_other" }],
    ["a revoked grant", grant({ revokedAt: new Date() }), {}],
    ["an expired grant", grant({ expiresAt: new Date(Date.now() - 1) }), {}],
  ])("refuses a refresh from %s", async (_l, g, over) => {
    mockDb.mcpGrant.findFirst.mockResolvedValueOnce(g);
    const { body } = await callToken({
      grant_type: "refresh_token",
      refresh_token: "rt-current",
      client_id: CLIENT.clientId,
      ...over,
    });
    expect(body.error).toBe("invalid_grant");
    expect(mockDb.mcpGrant.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the grant for someone who left the organisation", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValueOnce(grant());
    mockLoadAccount.mockRejectedValue(
      new McpAuthError("invalid_token", "no longer a member"),
    );
    mockDb.mcpGrant.updateMany.mockResolvedValue({ count: 1 });
    const { body } = await callToken({
      grant_type: "refresh_token",
      refresh_token: "rt-current",
      client_id: CLIENT.clientId,
    });
    expect(body.error).toBe("invalid_grant");
    expect(mockDb.mcpGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedReason: "account_ineligible" }),
      }),
    );
  });
});

describe("POST /oauth/revoke", () => {
  it("always answers 200, and only the owning client can revoke", async () => {
    mockDb.mcpGrant.findFirst.mockResolvedValue({
      id: "g1",
      clientId: CLIENT.clientId,
    });
    const res = makeRes();
    await revoke(
      { body: { token: "rt-current", client_id: "mcp_other" } } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDb.mcpGrant.updateMany).not.toHaveBeenCalled();

    const res2 = makeRes();
    await revoke({ body: { token: "nonsense" } } as any, res2);
    expect(res2.status).toHaveBeenCalledWith(200);
  });
});
