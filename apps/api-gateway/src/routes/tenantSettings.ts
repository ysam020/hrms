import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import {
  getTenantSettings,
  updateTenantSettings,
  cancelPendingSettings,
} from "../handlers/tenantSettings";

export const tenantSettingsRouter: Router = Router();

const guard = [authenticate, requireTenant, requireActiveSubscription];

// Any tenant member may read; only owner/admin may write (enforced in handler).
tenantSettingsRouter.get("/tenant-settings", ...guard, getTenantSettings);
tenantSettingsRouter.put("/tenant-settings", ...guard, updateTenantSettings);
tenantSettingsRouter.delete(
  "/tenant-settings/pending/:id",
  ...guard,
  cancelPendingSettings,
);
