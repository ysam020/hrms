import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../mcp/consent";

// The web app's consent screen and connected-assistants list for MCP (see
// mcp/consent.ts). Mounted behind the usual subscription guard, so these
// run on the person's own Praesto session with CSRF protection — the
// endpoints that external assistants call live in mcp/router.ts instead.
export const aiConnectionsRouter: Router = Router();

aiConnectionsRouter.get(
  "/ai-connections/requests/:requestId",
  authenticate,
  h.getConnectionRequest,
);
aiConnectionsRouter.post(
  "/ai-connections/requests/:requestId/approve",
  authenticate,
  h.approveConnectionRequest,
);
aiConnectionsRouter.post(
  "/ai-connections/requests/:requestId/deny",
  authenticate,
  h.denyConnectionRequest,
);
aiConnectionsRouter.get("/ai-connections", authenticate, h.listConnections);
aiConnectionsRouter.delete(
  "/ai-connections/:grantId",
  authenticate,
  h.revokeConnection,
);
