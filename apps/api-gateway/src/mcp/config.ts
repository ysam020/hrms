import { createHmac } from "node:crypto";

// Praesto's MCP endpoint lets an external AI assistant (Claude, ChatGPT, any
// MCP client) call a fixed set of read-only HRMS tools on a person's behalf.
// The assistant does the language work; Praesto only answers tool calls, so
// there is no model, GPU or LLM API key anywhere on this side.
//
// The gateway is both the OAuth 2.1 authorization server and the protected
// resource. People still sign in to Praesto itself (Google or a passkey);
// the authorization step only adds a consent screen in the web app on top
// of that existing session. See docs/mcp.md for the whole flow.

/**
 * The public origin of this gateway, which is the OAuth issuer, e.g.
 * https://api.praesto.in. Defaults to GOOGLE_CALLBACK_URL's origin (already
 * set in every environment) so no new variable is needed; MCP_ISSUER_URL
 * overrides it. Never derived from the request's Host header: tokens are
 * checked against this value, so it must not be caller-controlled.
 */
export function issuerUrl(): string {
  const explicit = process.env.MCP_ISSUER_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const callback = process.env.GOOGLE_CALLBACK_URL;
  if (callback) {
    try {
      return new URL(callback).origin;
    } catch {
      // fall through to the local default
    }
  }
  return `https://localhost:${process.env.API_GATEWAY_PORT || 9002}`;
}

/** The protected MCP endpoint, and the audience of every access token. */
export const resourceUrl = (): string => `${issuerUrl()}/mcp`;

/** Where the web app shows the consent screen (first CLIENT_URL entry). */
export function consentPageUrl(requestId: string): string {
  const clientUrl = (process.env.CLIENT_URL || "https://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  return `${clientUrl}/connect/authorize/${encodeURIComponent(requestId)}`;
}

// Each scope is what a person can tick on the consent screen. They only
// narrow what the assistant may ask for — a scope never grants access the
// person doesn't already have in Praesto, because every tool still reads
// only that person's own records (or their organisation's shared ones).
export const MCP_SCOPES = {
  "profile:read":
    "Your profile: name, contact details, department and designation",
  "leave:read": "Your leave balance and leave applications",
  "attendance:read": "Your attendance records",
  "payroll:read": "Your salary structure and deductions",
  "org:read": "Your organisation’s HR policies, announcements and holidays",
} as const;

export type McpScope = keyof typeof MCP_SCOPES;

export const ALL_SCOPES = Object.keys(MCP_SCOPES) as McpScope[];

/** Off by default on the consent screen: salary is the most sensitive. */
export const SCOPES_OFF_BY_DEFAULT: readonly McpScope[] = ["payroll:read"];

export const isMcpScope = (s: string): s is McpScope =>
  Object.prototype.hasOwnProperty.call(MCP_SCOPES, s);

// Lifetimes. An access token is short so a stolen one is worth little; the
// grant (and so its refresh token) has an absolute end so a forgotten
// connection doesn't live forever. Revocation is immediate either way.
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const GRANT_TTL_SECONDS = 90 * 24 * 60 * 60;
export const AUTH_REQUEST_TTL_SECONDS = 10 * 60;
export const AUTH_CODE_TTL_SECONDS = 2 * 60;

/**
 * The MCP access-token signing key: HMAC-derived from ACCESS_JWT_TOKEN with
 * a fixed label, so no new secret has to be provisioned, yet an MCP token
 * never verifies as a web session token (or the other way round) — the two
 * are signed with different keys.
 */
export function mcpSigningKey(): Buffer {
  return createHmac("sha256", process.env.ACCESS_JWT_TOKEN!)
    .update("praesto:mcp-access-token:v1")
    .digest();
}
