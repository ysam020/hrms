/**
 * Owners and admins can always manage the subscription for their org.
 * Superusers and explicit `Subscription:*` permission holders can also access it.
 */
const hasSubscriptionAccess = (
  user: {
    isSuperUser?: boolean;
    tenantRole?: string;
    permissions?: string[];
  } | null,
): boolean => {
  return Boolean(
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("Subscription:")),
  );
};

export default hasSubscriptionAccess;
