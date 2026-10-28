import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { getRedisClient } from "@hrms/cache";
import { logger } from "@hrms/logger";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ALL_SCOPES,
  AUTH_CODE_TTL_SECONDS,
  AUTH_REQUEST_TTL_SECONDS,
  GRANT_TTL_SECONDS,
  consentPageUrl,
  isMcpScope,
  issuerUrl,
  resourceUrl,
  type McpScope,
} from "./config";
import {
  McpAuthError,
  loadAccountContext,
  signMcpAccessToken,
  verifyMcpAccessToken,
} from "./principal";
import { recordMcpAudit } from "./audit";

// The OAuth 2.1 authorization server MCP clients talk to: metadata (RFC 8414
// and RFC 9728), dynamic client registration (RFC 7591), authorization code
// + PKCE, refresh-token rotation, and revocation (RFC 7009). Only public
// clients exist: nothing here issues or checks a client secret — PKCE binds
// a code to the client that started the flow instead.
//
// None of these endpoints read cookies, so they're mounted ahead of the CSRF
// middleware (see router.ts). The one step that does use the Praesto
// session — the person approving a request — is a normal CSRF-protected
// /api/v1 route (see consent.ts).

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString("base64url");

// ─── Metadata ────────────────────────────────────────────────────────────────

export function authorizationServerMetadata(_req: Request, res: Response) {
  const issuer = issuerUrl();
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALL_SCOPES,
  });
}

export function protectedResourceMetadata(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    resource: resourceUrl(),
    authorization_servers: [issuerUrl()],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Praesto HRMS",
  });
}

// ─── Dynamic client registration ─────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_REDIRECT_URIS = 5;

/**
 * https anywhere, http only to this machine (RFC 8252 §7.3), or an app's
 * private-use scheme in reverse-domain form (RFC 8252 §7.1, e.g.
 * com.example.app:/cb). Everything else — javascript:, data:, file:, a
 * fragment — is refused, since a code is delivered to this URI.
 */
function isAllowedRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  const scheme = url.protocol.slice(0, -1);
  if (scheme === "https") return true;
  if (scheme === "http") return LOOPBACK_HOSTS.has(url.hostname);
  return /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+$/.test(scheme);
}

function cleanText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, max) : undefined;
}

export async function registerClient(req: Request, res: Response) {
  const body = req.body ?? {};
  const redirectUris: unknown = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MAX_REDIRECT_URIS ||
    !redirectUris.every(isAllowedRedirectUri)
  ) {
    return res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: `Provide 1–${MAX_REDIRECT_URIS} redirect URIs using https, http on localhost, or a reverse-domain app scheme.`,
    });
  }

  const grantTypes: unknown = body.grant_types ?? ["authorization_code"];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.includes("authorization_code") ||
    grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")
  ) {
    return res.status(400).json({
      error: "invalid_client_metadata",
      error_description:
        "Only the authorization_code and refresh_token grants are supported.",
    });
  }

  let clientUri = cleanText(body.client_uri, 2048);
  if (clientUri) {
    try {
      if (new URL(clientUri).protocol !== "https:") clientUri = undefined;
    } catch {
      clientUri = undefined;
    }
  }

  try {
    const client = await prisma.mcpOAuthClient.create({
      data: {
        clientId: `mcp_${randomToken(18)}`,
        clientName: cleanText(body.client_name, 100) ?? "Unnamed MCP client",
        clientUri: clientUri ?? null,
        redirectUris: [...new Set(redirectUris as string[])],
      },
    });
    logger.info("mcp: client registered", {
      clientId: client.clientId,
      clientName: client.clientName,
    });
    // Whatever auth method the client asked for, it is registered as a
    // public client (RFC 7591 §3.2.1 lets the server substitute values).
    return res.status(201).json({
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      ...(client.clientUri && { client_uri: client.clientUri }),
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  } catch (error: unknown) {
    logger.error("mcp: client registration failed", { error });
    return res.status(500).json({ error: "server_error" });
  }
}

export async function findClient(clientId: unknown) {
  if (typeof clientId !== "string" || !/^mcp_[\w-]{1,64}$/.test(clientId)) {
    return null;
  }
  return prisma.mcpOAuthClient.findUnique({ where: { clientId } });
}

/**
 * Exact match against a registered URI — except that a loopback URI may use
 * any port, since native apps pick a free one at run time (RFC 8252 §7.3).
 */
export function redirectUriMatches(
  registered: readonly string[],
  requested: string,
): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== "http:" || !LOOPBACK_HOSTS.has(req.hostname)) {
    return false;
  }
  return registered.some((r) => {
    try {
      const reg = new URL(r);
      return (
        reg.protocol === "http:" &&
        reg.hostname === req.hostname &&
        reg.pathname === req.pathname &&
        reg.search === req.search
      );
    } catch {
      return false;
    }
  });
}

// ─── Authorization requests (pending consent) ────────────────────────────────

export interface PendingAuthRequest {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  redirectUri: string;
  codeChallenge: string;
  scopes: McpScope[];
  state: string | null;
}

interface AuthCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: McpScope[];
  userId: string;
  tenantId: string;
}

const authRequestKey = (id: string) => `mcp:authreq:${sha256Hex(id)}`;
const authCodeKey = (code: string) => `mcp:code:${sha256Hex(code)}`;

const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

/** The requested scopes we know, or all of them when none are named. */
function parseScopes(raw: unknown): McpScope[] {
  const requested =
    typeof raw === "string" ? raw.split(/\s+/).filter(isMcpScope) : [];
  return requested.length ? [...new Set(requested)] : [...ALL_SCOPES];
}

function withParams(uri: string, params: Record<string, string | null>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * GET /oauth/authorize. Validates the request, parks it in Redis, and sends
 * the browser to the web app's consent screen — which is where the person
 * signs in to Praesto (Google or passkey, as always) if they aren't already.
 */
export async function authorize(req: Request, res: Response) {
  const q = req.query;
  const client = await findClient(q.client_id).catch(() => null);
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";

  // Without a known client and one of its own redirect URIs there is nowhere
  // safe to send an error, so it's shown here instead (RFC 6749 §4.1.2.1).
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return res
      .status(400)
      .type("text/plain")
      .send(
        "This sign-in link isn't valid: the assistant that sent you here isn't registered with Praesto, or used an unregistered return address. Start connecting again from your assistant.",
      );
  }

  const state =
    typeof q.state === "string" && q.state.length <= 1024 ? q.state : null;
  const fail = (error: string, description: string) =>
    res.redirect(
      302,
      withParams(redirectUri, {
        error,
        error_description: description,
        state,
        iss: issuerUrl(),
      }),
    );

  if (q.response_type !== "code") {
    return fail("unsupported_response_type", "response_type must be code.");
  }
  if (q.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE with S256 is required.");
  }
  if (
    typeof q.code_challenge !== "string" ||
    !PKCE_VALUE.test(q.code_challenge)
  ) {
    return fail("invalid_request", "A valid code_challenge is required.");
  }
  if (q.resource !== undefined && !isOurResource(q.resource)) {
    return fail("invalid_target", `The only resource is ${resourceUrl()}.`);
  }

  const pending: PendingAuthRequest = {
    clientId: client.clientId,
    clientName: client.clientName,
    clientUri: client.clientUri ?? null,
    redirectUri,
    codeChallenge: q.code_challenge,
    scopes: parseScopes(q.scope),
    state,
  };
  const requestId = randomToken();
  try {
    await getRedisClient().set(
      authRequestKey(requestId),
      JSON.stringify(pending),
      "EX",
      AUTH_REQUEST_TTL_SECONDS,
    );
  } catch (error: unknown) {
    logger.error("mcp: failed to store authorization request", { error });
    return fail("temporarily_unavailable", "Please try again in a moment.");
  }
  return res.redirect(302, consentPageUrl(requestId));
}

const isOurResource = (raw: unknown): boolean =>
  typeof raw === "string" && raw.replace(/\/+$/, "") === resourceUrl();

export async function loadAuthRequest(
  requestId: string,
): Promise<PendingAuthRequest | null> {
  const raw = await getRedisClient().get(authRequestKey(requestId));
  return raw ? (JSON.parse(raw) as PendingAuthRequest) : null;
}

/** Single use: whoever takes it first (approve or deny) consumes it. */
export async function takeAuthRequest(
  requestId: string,
): Promise<PendingAuthRequest | null> {
  const raw = await getRedisClient().getdel(authRequestKey(requestId));
  return raw ? (JSON.parse(raw) as PendingAuthRequest) : null;
}

/** Issues the authorization code once the person has approved. */
export async function issueAuthCode(
  pending: PendingAuthRequest,
  scopes: McpScope[],
  who: { userId: string; tenantId: string },
): Promise<string> {
  const code = randomToken();
  const record: AuthCodeRecord = {
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    scopes,
    userId: who.userId,
    tenantId: who.tenantId,
  };
  await getRedisClient().set(
    authCodeKey(code),
    JSON.stringify(record),
    "EX",
    AUTH_CODE_TTL_SECONDS,
  );
  return withParams(pending.redirectUri, {
    code,
    state: pending.state,
    iss: issuerUrl(),
  });
}

export function deniedRedirect(pending: PendingAuthRequest): string {
  return withParams(pending.redirectUri, {
    error: "access_denied",
    error_description: "The request was declined.",
    state: pending.state,
    iss: issuerUrl(),
  });
}

// ─── Token endpoint ──────────────────────────────────────────────────────────

class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = Buffer.from(
    createHash("sha256").update(verifier).digest("base64url"),
  );
  const expected = Buffer.from(challenge);
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
}

interface IssuedTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function issueTokens(
  grant: {
    id: string;
    userId: string;
    tenantId: string;
    clientId: string;
    scopes: string[];
    expiresAt: Date;
  },
  refreshToken: string,
): IssuedTokens {
  // Never outlive the grant itself.
  const ttl = Math.max(
    1,
    Math.min(
      ACCESS_TOKEN_TTL_SECONDS,
      Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000),
    ),
  );
  const scope = grant.scopes.join(" ");
  return {
    access_token: signMcpAccessToken(
      {
        sub: grant.userId,
        tid: grant.tenantId,
        gid: grant.id,
        cid: grant.clientId,
        scope,
      },
      ttl,
    ),
    token_type: "Bearer",
    expires_in: ttl,
    refresh_token: refreshToken,
    scope,
  };
}

async function exchangeAuthorizationCode(body: any): Promise<IssuedTokens> {
  const { code, code_verifier, redirect_uri, client_id, resource } = body;
  if (typeof code !== "string" || !code) {
    throw new OAuthError("invalid_request", "code is required.");
  }
  if (typeof code_verifier !== "string" || !PKCE_VALUE.test(code_verifier)) {
    throw new OAuthError(
      "invalid_request",
      "A valid code_verifier is required.",
    );
  }
  if (resource !== undefined && !isOurResource(resource)) {
    throw new OAuthError(
      "invalid_target",
      `The only resource is ${resourceUrl()}.`,
    );
  }

  // Taken (deleted) before any check, so a code works at most once even if
  // the checks below fail — a wrong verifier burns it.
  const raw = await getRedisClient().getdel(authCodeKey(code));
  if (!raw) {
    throw new OAuthError(
      "invalid_grant",
      "The code is invalid or has expired.",
    );
  }
  const record = JSON.parse(raw) as AuthCodeRecord;
  if (
    record.clientId !== client_id ||
    record.redirectUri !== redirect_uri ||
    !pkceMatches(code_verifier, record.codeChallenge)
  ) {
    throw new OAuthError(
      "invalid_grant",
      "The code doesn't match this request.",
    );
  }

  const [client, account] = await Promise.all([
    findClient(record.clientId),
    loadAccountContext(record.userId, record.tenantId),
  ]);
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);

  const refreshToken = randomToken();
  const grant = await prisma.mcpGrant.create({
    data: {
      userId: record.userId,
      tenantId: record.tenantId,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes: record.scopes,
      refreshTokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + GRANT_TTL_SECONDS * 1000),
      // Stored explicitly: on MongoDB, Prisma's `revokedAt: null` filter
      // (used for every "still active" check) matches a null value but not
      // a missing field, which is what an omitted optional field becomes.
      revokedAt: null,
    },
  });

  recordMcpAudit({
    tenantId: record.tenantId,
    dbName: account.dbName,
    userId: record.userId,
    username: account.username,
    action: "CONNECT",
    description: `Connected AI assistant “${client.clientName}”`,
    details: {
      grantId: grant.id,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes: record.scopes,
    },
  });
  logger.info("mcp: grant created", {
    grantId: grant.id,
    clientId: client.clientId,
    userId: record.userId,
    tenantId: record.tenantId,
  });

  return issueTokens(grant, refreshToken);
}

const REVOKE_REASONS: Record<string, string> = {
  user_revoked: "Disconnected",
  client_revoked: "The assistant disconnected",
  refresh_token_reuse: "Revoked after a refresh token was reused",
  account_ineligible: "Revoked: the account can no longer access Praesto",
};

/** Ends a grant (idempotent) and records it in the organisation's audit log. */
export async function revokeGrant(
  grantId: string,
  reason: keyof typeof REVOKE_REASONS,
  actor?: { username: string | null; ipAddress?: string; userAgent?: string },
) {
  const { count } = await prisma.mcpGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  if (count !== 1) return false;
  logger.info("mcp: grant revoked", { grantId, reason });

  const grant = await prisma.mcpGrant.findUnique({ where: { id: grantId } });
  const tenant = grant
    ? await prisma.tenant.findUnique({
        where: { id: grant.tenantId },
        select: { dbName: true },
      })
    : null;
  if (grant && tenant) {
    recordMcpAudit({
      tenantId: grant.tenantId,
      dbName: tenant.dbName,
      userId: grant.userId,
      username: actor?.username ?? null,
      action: "DISCONNECT",
      description: `${REVOKE_REASONS[reason]}: AI assistant “${grant.clientName}”`,
      details: { grantId, clientId: grant.clientId, reason },
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
    });
  }
  return true;
}

async function refreshAccessToken(body: any): Promise<IssuedTokens> {
  const { refresh_token, client_id } = body;
  if (typeof refresh_token !== "string" || !refresh_token) {
    throw new OAuthError("invalid_request", "refresh_token is required.");
  }
  const hash = sha256Hex(refresh_token);
  const grant = await prisma.mcpGrant.findFirst({
    where: { refreshTokenHash: hash },
  });

  if (!grant) {
    // A refresh token that was already rotated out being used again means a
    // copy of it exists somewhere it shouldn't: end the whole grant, which
    // also kills whichever copy rotated first (OAuth 2.1 §4.3.1).
    const reused = await prisma.mcpGrant.findFirst({
      where: { prevRefreshTokenHash: hash, revokedAt: null },
    });
    if (reused) {
      await revokeGrant(reused.id, "refresh_token_reuse");
      logger.warn("mcp: refresh token reuse — grant revoked", {
        grantId: reused.id,
        clientId: reused.clientId,
      });
    }
    throw new OAuthError("invalid_grant", "The refresh token is invalid.");
  }
  if (grant.clientId !== client_id) {
    throw new OAuthError("invalid_grant", "The refresh token is invalid.");
  }
  if (grant.revokedAt || grant.expiresAt <= new Date()) {
    throw new OAuthError(
      "invalid_grant",
      "This connection has been revoked or has expired. Connect Praesto again.",
    );
  }

  try {
    await loadAccountContext(grant.userId, grant.tenantId);
  } catch (error) {
    if (error instanceof McpAuthError && error.code === "invalid_token") {
      // Left the organisation, blocked, or organisation gone: permanently.
      await revokeGrant(grant.id, "account_ineligible");
    }
    throw new OAuthError(
      "invalid_grant",
      error instanceof Error ? error.message : "Not allowed.",
    );
  }

  const next = randomToken();
  // Compare-and-swap on the current hash: of two concurrent refreshes with
  // the same token, exactly one rotates; the other gets invalid_grant.
  const { count } = await prisma.mcpGrant.updateMany({
    where: { id: grant.id, refreshTokenHash: hash, revokedAt: null },
    data: { refreshTokenHash: sha256Hex(next), prevRefreshTokenHash: hash },
  });
  if (count !== 1) {
    throw new OAuthError("invalid_grant", "The refresh token is invalid.");
  }
  return issueTokens(grant, next);
}

/** POST /oauth/token */
export async function token(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  const body = req.body ?? {};
  try {
    let tokens: IssuedTokens;
    if (body.grant_type === "authorization_code") {
      tokens = await exchangeAuthorizationCode(body);
    } else if (body.grant_type === "refresh_token") {
      tokens = await refreshAccessToken(body);
    } else {
      throw new OAuthError(
        "unsupported_grant_type",
        "grant_type must be authorization_code or refresh_token.",
      );
    }
    return res.json(tokens);
  } catch (error: unknown) {
    if (error instanceof OAuthError) {
      return res
        .status(error.httpStatus)
        .json({ error: error.code, error_description: error.message });
    }
    if (error instanceof McpAuthError) {
      return res
        .status(400)
        .json({ error: "invalid_grant", error_description: error.message });
    }
    logger.error("mcp: token endpoint error", { error });
    return res.status(500).json({ error: "server_error" });
  }
}

/**
 * POST /oauth/revoke (RFC 7009). Takes either token type; ends the grant
 * behind it. Always 200, so it can't be used to test whether a token exists.
 */
export async function revoke(req: Request, res: Response) {
  const { token: presented, client_id } = req.body ?? {};
  try {
    if (typeof presented === "string" && presented) {
      const claims = verifyMcpAccessToken(presented);
      const grant = claims
        ? await prisma.mcpGrant.findUnique({ where: { id: claims.gid } })
        : await prisma.mcpGrant.findFirst({
            where: { refreshTokenHash: sha256Hex(presented) },
          });
      if (grant && grant.clientId === client_id) {
        await revokeGrant(grant.id, "client_revoked");
      }
    }
  } catch (error: unknown) {
    logger.error("mcp: revocation error", { error });
  }
  return res.status(200).end();
}
