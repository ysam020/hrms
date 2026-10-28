import { getClientForDb } from "@hrms/db";
import { logger } from "@hrms/logger";

export interface McpAuditEntry {
  tenantId: string;
  dbName: string | null;
  userId: string;
  username: string | null;
  // CONNECT / DISCONNECT for a grant's lifecycle, READ for a tool call.
  action: "CONNECT" | "DISCONNECT" | "READ";
  description: string;
  // Identifiers only (tool name, client, outcome) — never tool results,
  // tokens or arguments that could carry personal data.
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes to the organisation's own audit log (Settings → Audit Logs, owners
 * and admins only), so an organisation can see which assistants its people
 * connected and what they read. Grants live in the master DB, outside the
 * tenant-DB audit middleware, so these entries are written explicitly.
 * Never throws: auditing must not break the call it records.
 */
export function recordMcpAudit(entry: McpAuditEntry): void {
  if (!entry.dbName) return;
  getClientForDb(entry.dbName)
    .auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        username: entry.username,
        action: entry.action,
        entityType: "McpConnection",
        newValue: entry.details as any,
        description: entry.description,
        ipAddress: entry.ipAddress ?? "",
        userAgent: entry.userAgent ?? "",
      },
    })
    .catch((error: unknown) =>
      logger.warn("mcp: failed to write audit entry", { error }),
    );
}
