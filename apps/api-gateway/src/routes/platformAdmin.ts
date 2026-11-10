import { Router } from "express";
import { validate } from "../middleware/validate";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import * as h from "../handlers/platformAdmin";
import * as leads from "../handlers/leads";
import {
  platformRangeQuerySchema,
  platformTenantsQuerySchema,
  platformPaymentsQuerySchema,
  platformAuditQuerySchema,
  platformSyncSchema,
  platformLeadsQuerySchema,
  platformLeadUpdateSchema,
  platformLeadNoteSchema,
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

// Website sales leads (handlers/leads.ts). Specific paths before :leadId.
platformAdminRouter.get(
  "/leads",
  requirePlatformAdmin("view_leads"),
  validate(platformLeadsQuerySchema, "query"),
  leads.listLeads,
);
platformAdminRouter.get(
  "/leads/metrics",
  requirePlatformAdmin("view_leads"),
  validate(platformRangeQuerySchema, "query"),
  leads.getLeadMetrics,
);
platformAdminRouter.get(
  "/leads/owners",
  requirePlatformAdmin("view_leads"),
  leads.listLeadOwners,
);
platformAdminRouter.get(
  "/leads/:leadId",
  requirePlatformAdmin("view_leads"),
  leads.getLead,
);
platformAdminRouter.patch(
  "/leads/:leadId",
  requirePlatformAdmin("manage_leads"),
  validate(platformLeadUpdateSchema),
  leads.updateLead,
);
platformAdminRouter.post(
  "/leads/:leadId/notes",
  requirePlatformAdmin("manage_leads"),
  validate(platformLeadNoteSchema),
  leads.addLeadNote,
);
