import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import {
  createTenant,
  selectTenant,
  inviteUser,
  resolveInvite,
  getMyTenant,
  listTenantMembers,
  revokeInvite,
  listAvailableTenants,
} from "../handlers/tenant";

export const tenantRouter: Router = Router();

// Public — used by the invite landing page before login
tenantRouter.get("/tenants/invite/:token", resolveInvite);

// Requires auth but NOT a fully resolved tenant (pendingSetup users can access)
tenantRouter.get("/tenants/available", authenticate, listAvailableTenants);
tenantRouter.post("/tenants", authenticate, createTenant);
tenantRouter.post("/tenants/select", authenticate, selectTenant);

// Requires tenant context but NOT subscription check — subscription page must load even when expired
tenantRouter.get("/tenants/me", authenticate, requireTenant, getMyTenant);

// Requires a resolved tenant + active subscription
const guard = [authenticate, requireTenant, requireActiveSubscription];
tenantRouter.get("/tenants/members", ...guard, listTenantMembers);
tenantRouter.post("/tenants/invite", ...guard, inviteUser);
tenantRouter.delete("/tenants/invite/:id", ...guard, revokeInvite);
