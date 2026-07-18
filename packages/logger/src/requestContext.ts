import { AsyncLocalStorage } from "async_hooks";

// Correlation ID threaded through a single user-facing request as it fans
// out across HTTP (api-gateway) -> gRPC (microservices) -> queue (BullMQ
// jobs). Without this, debugging an incident that spans several services
// means manually correlating log lines by timestamp and tenant, which
// doesn't scale past a handful of services. Read via getRequestId() by the
// winston format below so every logger.info/error/warn call picks it up
// automatically, with no changes needed at each call site.
export const requestIdStorage = new AsyncLocalStorage<string>();

export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}
