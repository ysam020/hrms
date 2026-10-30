// Free-trial eligibility: one trial per organisation, not per account.
//
// An organisation doesn't exist yet when its trial starts, so it's
// recognised by the signals that outlive any one signup: the account
// creating it, its company email domain, and the UPI handle that authorises
// the mandate. Each signal used by a trial is recorded as a TrialClaim with a
// unique key; a later signup sharing any of them gets the paid flow instead.
// checkTrialEligibility is the advisory pre-check (shown on the plan step and
// re-run before a trial subscription is created); claimTrial is the binding,
// race-safe one, run in buildTenant just before the tenant is inserted.

import { createHash } from "crypto";
import {
  prisma,
  Prisma,
  canonicalizeEmail,
  getEmailDomain,
  isPublicEmailDomain,
} from "@hrms/db";

export type TrialIneligibleReason =
  | "owns_organisation"
  | "domain_has_organisation"
  | "trial_used";

export type TrialEligibility =
  | { eligible: true }
  | { eligible: false; reason: TrialIneligibleReason };

export const TRIAL_INELIGIBLE_MESSAGE: Record<TrialIneligibleReason, string> = {
  owns_organisation:
    "You already own an organisation on Praesto, so this one starts on a paid plan.",
  domain_has_organisation:
    "An organisation with your email domain is already on Praesto, so this one starts on a paid plan.",
  trial_used:
    "Your organisation has already used its free trial, so this one starts on a paid plan.",
};

const userKey = (userId: string) => `user:${userId}`;
const domainKey = (domain: string) => `domain:${domain}`;

// Hashed: the claims collection only needs equality, not the handle itself.
export function instrumentKey(method: string, summary: string): string | null {
  if (method !== "upi" || !summary.includes("@")) return null;
  const vpa = summary.trim().toLowerCase();
  return `instrument:${createHash("sha256").update(vpa).digest("hex")}`;
}

async function companyDomainOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return null;
  const domain = getEmailDomain(canonicalizeEmail(user.email));
  return domain && !isPublicEmailDomain(domain) ? domain : null;
}

/** The signals a signup by this user would claim, before checkout. */
export async function trialKeysFor(userId: string): Promise<string[]> {
  const domain = await companyDomainOf(userId);
  return [userKey(userId), ...(domain ? [domainKey(domain)] : [])];
}

/**
 * buildTenant passes `claims: false` — claimTrial does that check atomically
 * there — and `subscriptionId`, so a retried signup is never refused because
 * of its own claims or the tenant its own earlier attempt created.
 */
export async function checkTrialEligibility(
  userId: string,
  {
    claims = true,
    subscriptionId,
  }: { claims?: boolean; subscriptionId?: string } = {},
): Promise<TrialEligibility> {
  // Someone who already owns an organisation is adding a workspace for it,
  // not bringing a new organisation — this also keeps every existing paying
  // customer out of the trial.
  const ownership = await prisma.tenantMembership.findFirst({
    where: { userId, role: "owner" },
    select: { id: true },
  });
  if (ownership) return { eligible: false, reason: "owns_organisation" };

  // Any tenant ever created for the domain, active or not — tenants that
  // predate trials have no claims, so the tenant row itself is the record.
  const domain = await companyDomainOf(userId);
  if (domain) {
    const existing = await prisma.tenant.findFirst({
      where: {
        domain,
        ...(subscriptionId && {
          NOT: { razorpaySubscriptionId: subscriptionId },
        }),
      },
      select: { id: true },
    });
    if (existing) return { eligible: false, reason: "domain_has_organisation" };
  }

  if (!claims) return { eligible: true };
  const keys = [userKey(userId), ...(domain ? [domainKey(domain)] : [])];
  const claimed = await prisma.trialClaim.findFirst({
    where: { key: { in: keys } },
    select: { id: true },
  });
  if (claimed) return { eligible: false, reason: "trial_used" };

  return { eligible: true };
}

/**
 * Records every key against this trial subscription. Returns false — after
 * removing the keys this call inserted — if any key already belongs to a
 * different subscription. A key held by the same subscription is a retry of
 * this signup (e.g. completePendingSetup after a closed tab) and passes.
 */
export async function claimTrial(
  keys: string[],
  subscriptionId: string,
  userId: string,
): Promise<boolean> {
  const inserted: string[] = [];
  for (const key of keys) {
    try {
      await prisma.trialClaim.create({
        data: { key, subscriptionId, userId },
      });
      inserted.push(key);
    } catch (error: unknown) {
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!duplicate) {
        await releaseClaims(inserted, subscriptionId);
        throw error;
      }
      const holder = await prisma.trialClaim.findUnique({
        where: { key },
        select: { subscriptionId: true },
      });
      if (holder?.subscriptionId !== subscriptionId) {
        await releaseClaims(inserted, subscriptionId);
        return false;
      }
    }
  }
  return true;
}

async function releaseClaims(keys: string[], subscriptionId: string) {
  if (keys.length === 0) return;
  await prisma.trialClaim.deleteMany({
    where: { key: { in: keys }, subscriptionId },
  });
}
