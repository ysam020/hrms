import { Router } from "express";
import { validate } from "../middleware/validate";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import * as h from "../handlers/platformAdmin";
import {
  platformRangeQuerySchema,
  platformTenantsQuerySchema,
  platformPaymentsQuerySchema,
  platformAuditQuerySchema,
  platformSyncSchema,
} from "../schemas";

// The Praesto Platform Console's API. Mounted at /platform/admin behind
// authenticate (routes/index.ts); every route names the PraestoAdmin action
// it needs, checked live against the user's record on each request.
export const platformAdminRouter: Router = Router();

platformAdminRouter.get(
  "/overview",
  requirePlatformAdmin("view_overview"),
  validate(platformRangeQuerySchema, "query"),
  h.getOverview,
);
platformAdminRouter.get(
  "/tenants",
  requirePlatformAdmin("view_tenants"),
  validate(platformTenantsQuerySchema, "query"),
  h.listTenants,
);
platformAdminRouter.get(
  "/tenants/:tenantId",
  requirePlatformAdmin("view_tenants"),
  h.getTenant,
);
platformAdminRouter.post(
  "/tenants/:tenantId/sync",
  requirePlatformAdmin("manage_billing"),
  validate(platformSyncSchema),
  h.syncTenant,
);
platformAdminRouter.get(
  "/subscriptions",
  requirePlatformAdmin("view_billing"),
  validate(platformRangeQuerySchema, "query"),
  h.getSubscriptions,
);
platformAdminRouter.get(
  "/payments",
  requirePlatformAdmin("view_billing"),
  validate(platformPaymentsQuerySchema, "query"),
  h.listPayments,
);
platformAdminRouter.post(
  "/billing/sync",
  requirePlatformAdmin("manage_billing"),
  validate(platformSyncSchema),
  h.syncAllPayments,
);
platformAdminRouter.get(
  "/revenue",
  requirePlatformAdmin("view_billing"),
  validate(platformRangeQuerySchema, "query"),
  h.getRevenue,
);
platformAdminRouter.get(
  "/audit-logs",
  requirePlatformAdmin("view_audit_logs"),
  validate(platformAuditQuerySchema, "query"),
  h.listAuditLogs,
);
