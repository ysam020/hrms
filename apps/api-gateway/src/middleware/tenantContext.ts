import { AsyncLocalStorage } from "async_hooks";

// Who is making the current request — forwarded as gRPC metadata (see
// grpcCall in ../grpc/clients.ts) so downstream services can attribute an
// audit-logged mutation to a person even though it happens in a different
// process than the one that authenticated the request.
export interface GatewayActor {
  userId: string | null;
  username: string | null;
  ipAddress: string;
  userAgent: string;
}

interface GatewayTenantContext {
  tenantId: string | null;
  dbName: string | null;
  actor?: GatewayActor;
}

export const gatewayTenantStorage =
  new AsyncLocalStorage<GatewayTenantContext>();
