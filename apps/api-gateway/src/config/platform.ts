// Praesto's own organisation — the one tenant with platform-level rights
// (today: working the cross-tenant support queue). Identified only by
// PLATFORM_TENANT_ID from config, never by name, slug or domain, so no
// customer can become the platform tenant by what they call their org.
//
// Unset or malformed → no tenant is the platform tenant, and every
// platform-only feature is closed (fails closed, not open).

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function platformTenantId(): string | null {
  const id = process.env.PLATFORM_TENANT_ID?.trim();
  return id && OBJECT_ID.test(id) ? id : null;
}

export function isPlatformTenant(tenantId: string | null | undefined): boolean {
  const platform = platformTenantId();
  return !!platform && !!tenantId && tenantId === platform;
}
