import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { AuthRequest } from "../middleware/authenticate";
import {
  MCP_SCOPES,
  SCOPES_OFF_BY_DEFAULT,
  isMcpScope,
  resourceUrl,
} from "./config";
import {
  deniedRedirect,
  issueAuthCode,
  loadAuthRequest,
  revokeGrant,
  takeAuthRequest,
} from "./oauth";

// The web app's side of connecting an AI assistant: the consent screen
// (/connect/authorize/:requestId) and the list of connected assistants.
// These run on the person's normal Praesto session (authenticate +
// requireTenant + CSRF, see routes/aiConnections.ts) — this is the step
// where Praesto's existing Google/passkey sign-in decides who the grant is
// for. The user and organisation come from that session, never the request.

const REQUEST_ID = /^[A-Za-z0-9_-]{20,128}$/;

const requestIdOf = (req: Request): string | null => {
  const id = String(req.params.requestId ?? "");
  return REQUEST_ID.test(id) ? id : null;
};

const expired = (res: Response) =>
  apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
    message:
      "This connection request has expired or was already answered. Start connecting again from your assistant.",
  });

/** GET /ai-connections/requests/:requestId — what the consent screen shows. */
export async function getConnectionRequest(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  const requestId = requestIdOf(req);
  try {
    const pending = requestId ? await loadAuthRequest(requestId) : null;
    if (!pending) return expired(res);

    const tenant = await prisma.tenant.findUnique({
      where: { id: user!.tenantId! },
      select: { name: true },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Connection request",
      data: {
        clientName: pending.clientName,
        clientUri: pending.clientUri,
        // Shown so the person can see where approval sends them.
        redirectHost: new URL(pending.redirectUri).host || pending.redirectUri,
        organisation: tenant?.name ?? null,
        scopes: pending.scopes.map((scope) => ({
          scope,
          description: MCP_SCOPES[scope],
          defaultOn: !SCOPES_OFF_BY_DEFAULT.includes(scope),
        })),
      },
    });
  } catch (error: unknown) {
    logger.error("ai-connections: load request failed", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

/** POST /ai-connections/requests/:requestId/approve { scopes: string[] } */
export async function approveConnectionRequest(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  const requestId = requestIdOf(req);
  const chosen: unknown = req.body?.scopes;
  if (
    !Array.isArray(chosen) ||
    chosen.length === 0 ||
    !chosen.every((s) => typeof s === "string" && isMcpScope(s))
  ) {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Choose at least one thing the assistant may see.",
    });
  }
  try {
    const pending = requestId ? await takeAuthRequest(requestId) : null;
    if (!pending) return expired(res);

    // Only ever a subset of what the assistant asked for.
    const scopes = pending.scopes.filter((s) => chosen.includes(s));
    if (scopes.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Choose at least one thing the assistant may see.",
      });
    }
    const redirectTo = await issueAuthCode(pending, scopes, {
      userId: user!.userId,
      tenantId: user!.tenantId!,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Approved",
      data: { redirectTo },
    });
  } catch (error: unknown) {
    logger.error("ai-connections: approve failed", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

/** POST /ai-connections/requests/:requestId/deny */
export async function denyConnectionRequest(req: Request, res: Response) {
  const requestId = requestIdOf(req);
  try {
    const pending = requestId ? await takeAuthRequest(requestId) : null;
    if (!pending) return expired(res);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Declined",
      data: { redirectTo: deniedRedirect(pending) },
    });
  } catch (error: unknown) {
    logger.error("ai-connections: deny failed", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

/**
 * GET /ai-connections — the signed-in person's own active connections, and
 * the MCP address to give an assistant (the gateway's own resource URL, so
 * the web app never has to work it out).
 */
export async function listConnections(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const grants = await prisma.mcpGrant.findMany({
      where: {
        userId: user!.userId,
        tenantId: user!.tenantId!,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        clientName: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Connections",
      data: {
        mcpUrl: resourceUrl(),
        connections: grants.map((g) => ({
          ...g,
          scopes: g.scopes.filter(isMcpScope).map((scope) => ({
            scope,
            description: MCP_SCOPES[scope],
          })),
        })),
      },
    });
  } catch (error: unknown) {
    logger.error("ai-connections: list failed", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

/** DELETE /ai-connections/:grantId — disconnect one of your own. */
export async function revokeConnection(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  const grantId = String(req.params.grantId ?? "");
  if (!/^[a-f0-9]{24}$/.test(grantId)) {
    return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
      message: "Connection not found",
    });
  }
  try {
    // Scoped to the caller: someone else's grant id is simply not found.
    const grant = await prisma.mcpGrant.findFirst({
      where: { id: grantId, userId: user!.userId, tenantId: user!.tenantId! },
      select: { id: true },
    });
    if (!grant) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Connection not found",
      });
    }
    const actor = await prisma.user.findUnique({
      where: { id: user!.userId },
      select: { username: true },
    });
    await revokeGrant(grant.id, "user_revoked", {
      username: actor?.username ?? null,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Disconnected",
    });
  } catch (error: unknown) {
    logger.error("ai-connections: revoke failed", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}
