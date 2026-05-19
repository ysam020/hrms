import { AsyncLocalStorage } from "async_hooks";

interface GatewayTenantContext {
  tenantId: string | null;
  dbName: string | null;
}

export const gatewayTenantStorage =
  new AsyncLocalStorage<GatewayTenantContext>();
