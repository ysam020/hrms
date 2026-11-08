import type { Response } from "express";
import { leaseClient } from "@hrms/db";

/**
 * Holds a tenant database client until the response ends. runWithTenant
 * only holds it while `next()` runs, which returns as soon as the handler
 * chain goes async; without this, pool eviction could disconnect the
 * client while the handler is still querying.
 */
export function leaseForRequest(res: Response, client: object | null): void {
  if (!client) return;
  const release = leaseClient(client);
  res.once("finish", release);
  res.once("close", release);
}
