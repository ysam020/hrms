import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import {
  createTenant,
  completePendingSetup,
  selectTenant,
  getMyTenant,
  listTenantMembers,
  listAvailableTenants,
  getOrgProfile,
  updateOrgProfile,
  completeOrgSetup,
  checkDomainSuggestion,
  createJoinRequest,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  listPendingJoinRequestActions,
} from "../handlers/tenant";

export const tenantRouter: Router = Router();

// Requires auth but NOT a fully resolved tenant (pendingSetup users can access)
tenantRouter.get("/tenants/available", authenticate, listAvailableTenants);
tenantRouter.post("/tenants", authenticate, createTenant);
tenantRouter.post(
  "/tenants/complete-pending-setup",
  authenticate,
  completePendingSetup,
);
tenantRouter.post("/tenants/select", authenticate, selectTenant);
tenantRouter.get(
  "/tenants/domain-suggestion",
  authenticate,
  checkDomainSuggestion,
);
tenantRouter.post("/tenants/join-requests", authenticate, createJoinRequest);
// Feeds the sidebar/dashboard "Pending Approvals" surfaces — gated inside
// the handler (canApproveJoinRequests), same pattern as
// GET /kyc-approvals/pending in routes/employee.ts.
tenantRouter.get(
  "/tenants/join-requests/pending",
  authenticate,
  listPendingJoinRequestActions,
);

// Requires tenant context but NOT subscription check — subscription page must load even when expired
tenantRouter.get("/tenants/me", authenticate, requireTenant, getMyTenant);
// Marks org profile step complete; no subscription guard since user is still in setup flow
tenantRouter.post(
  "/tenants/complete-org-setup",
  authenticate,
  requireTenant,
  completeOrgSetup,
);

// Requires a resolved tenant + active subscription
const guard = [authenticate, requireTenant, requireActiveSubscription];
tenantRouter.get("/tenants/members", ...guard, listTenantMembers);
tenantRouter.get("/tenants/org-profile", ...guard, getOrgProfile);
tenantRouter.put("/tenants/org-profile", ...guard, updateOrgProfile);
tenantRouter.get("/tenants/join-requests", ...guard, listJoinRequests);
tenantRouter.post(
  "/tenants/join-requests/:id/approve",
  ...guard,
  approveJoinRequest,
);
tenantRouter.post(
  "/tenants/join-requests/:id/reject",
  ...guard,
  rejectJoinRequest,
);
