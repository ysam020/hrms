import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import {
  createTenant,
  completePendingSetup,
  selectTenant,
  inviteUser,
  resolveInvite,
  getMyTenant,
  listTenantMembers,
  revokeInvite,
  listAvailableTenants,
  getOrgProfile,
  updateOrgProfile,
  completeOrgSetup,
} from "../handlers/tenant";

export const tenantRouter: Router = Router();

// Public — used by the invite landing page before login
tenantRouter.get("/tenants/invite/:token", resolveInvite);

// Requires auth but NOT a fully resolved tenant (pendingSetup users can access)
tenantRouter.get("/tenants/available", authenticate, listAvailableTenants);
tenantRouter.post("/tenants", authenticate, createTenant);
tenantRouter.post(
  "/tenants/complete-pending-setup",
  authenticate,
  completePendingSetup,
);
tenantRouter.post("/tenants/select", authenticate, selectTenant);

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
tenantRouter.post("/tenants/invite", ...guard, inviteUser);
tenantRouter.delete("/tenants/invite/:id", ...guard, revokeInvite);
tenantRouter.get("/tenants/org-profile", ...guard, getOrgProfile);
tenantRouter.put("/tenants/org-profile", ...guard, updateOrgProfile);
