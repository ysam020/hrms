export const ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  HR: "hr",
} as const;

export type TenantRole = (typeof ROLE)[keyof typeof ROLE];
