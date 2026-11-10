/**
 * Sales leads from the public website: vocabulary and the pure rules the
 * handlers apply (normalisation, attribution sanitising, stage timestamps,
 * retention). No I/O here, so every rule is unit-tested directly.
 */

export const LEAD_KINDS = ["demo", "sales", "custom"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const LEAD_KIND_LABELS: Record<LeadKind, string> = {
  demo: "Demo Request",
  sales: "Sales Enquiry",
  custom: "Custom Solution Enquiry",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "demo_scheduled",
  "negotiation",
  "converted",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses after which a new submission starts a new lead. */
export const CLOSED_LEAD_STATUSES: readonly LeadStatus[] = [
  "converted",
  "lost",
];

/** The organisation-setup choices (web: org-setup/constants.tsx). */
export const COMPANY_SIZES = ["1–25", "26–100", "More than 100"] as const;

export const PREFERRED_TIMES = ["morning", "afternoon", "evening"] as const;

/** Months a lead is kept after its last activity (submission or staff change). */
export const LEAD_RETENTION_MONTHS = (() => {
  const n = Number(process.env.LEAD_RETENTION_MONTHS);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : 24;
})();

export function purgeDateFrom(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + LEAD_RETENTION_MONTHS);
  return d;
}

/** A repeat from the same address within this window is the same request. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
/** The team (and the prospect) hear about one lead at most this often. */
export const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const NOTE_MAX = 2000;
export const NOTES_PER_LEAD_MAX = 200;

// ── Normalisation ──────────────────────────────────────────────────────────

// Personal webmail, on top of @hrms/db's PUBLIC_EMAIL_DOMAINS (which leaves
// gmail.com out on purpose, for tenant-join routing). For leads it is only a
// qualification hint shown to the team; nobody is refused.
const WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "ymail.com",
  "rediffmail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zohomail.in",
  "zohomail.com",
]);

export function isWebmail(
  domain: string,
  isPublicEmailDomain: (d: string) => boolean,
): boolean {
  const d = domain.trim().toLowerCase();
  return WEBMAIL_DOMAINS.has(d) || isPublicEmailDomain(d);
}

export function normalizeLeadEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Phone to E.164. Accepts "+<country><number>" (8–15 digits) or a 10-digit
 * Indian mobile (with or without a leading 0 or 91). Spaces, dashes, dots
 * and brackets are ignored. Anything else is null (invalid).
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (!/^\d+$/.test(s)) return null;
  const local = s.replace(/^(?:0|91)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

// ── Attribution ────────────────────────────────────────────────────────────

export type AttributionInput = Partial<{
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  utmId: string;
  landingPage: string;
  referrerHost: string;
}>;

const ATTRIBUTION_MAX = 100;
// Campaign values are labels like "linkedin", "cpc", "diwali_2026".
const SAFE_VALUE = /^[\p{L}\p{N} _\-.+:/|]+$/u;
// Anything that looks like contact details is dropped, not stored.
const LOOKS_PERSONAL = /@|%40|\d{7,}/;

/** A campaign value, or undefined when empty, too long, odd or personal. */
export function cleanAttributionValue(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > ATTRIBUTION_MAX) return undefined;
  if (!SAFE_VALUE.test(s) || LOOKS_PERSONAL.test(s)) return undefined;
  return s;
}

/** A same-site path without query or fragment, e.g. "/" or "/book-demo". */
export function cleanLandingPage(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const path = v.split(/[?#]/)[0].trim();
  if (!/^\/[A-Za-z0-9\-_/]{0,99}$/.test(path)) return undefined;
  return LOOKS_PERSONAL.test(path) ? undefined : path;
}

/** A bare host name, e.g. "www.linkedin.com". */
export function cleanReferrerHost(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const host = v.trim().toLowerCase();
  return /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)
    ? host
    : undefined;
}

export function sanitizeAttribution(
  input: AttributionInput | undefined,
): AttributionInput {
  const a = input ?? {};
  const out: AttributionInput = {
    utmSource: cleanAttributionValue(a.utmSource),
    utmMedium: cleanAttributionValue(a.utmMedium),
    utmCampaign: cleanAttributionValue(a.utmCampaign),
    utmTerm: cleanAttributionValue(a.utmTerm),
    utmContent: cleanAttributionValue(a.utmContent),
    utmId: cleanAttributionValue(a.utmId),
    landingPage: cleanLandingPage(a.landingPage),
    referrerHost: cleanReferrerHost(a.referrerHost),
  };
  for (const k of Object.keys(out) as (keyof AttributionInput)[])
    if (out[k] === undefined) delete out[k];
  return out;
}

/** The channel a lead is reported under: utm_source, else referrer, else direct. */
export function leadChannel(l: {
  utmSource?: string | null;
  referrerHost?: string | null;
}): string {
  if (l.utmSource) return l.utmSource.toLowerCase();
  if (l.referrerHost) return l.referrerHost.replace(/^www\./, "");
  return "direct";
}

// ── Stages ─────────────────────────────────────────────────────────────────

const STAGE_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  demo_scheduled: 3,
  negotiation: 4,
  converted: 5,
  lost: -1,
};

type StageDates = {
  qualifiedAt?: Date | null;
  demoScheduledAt?: Date | null;
  convertedAt?: Date | null;
  lostAt?: Date | null;
};

/**
 * Stage timestamps to set when a lead moves to `to`: the first time it
 * reaches qualified, demo_scheduled, converted or lost. Moving straight to a
 * later stage also stamps "qualified" (a demo implies qualification), but
 * never a demo that didn't happen. Existing timestamps are never changed.
 */
export function stageStamps(
  current: StageDates,
  to: LeadStatus,
  now: Date = new Date(),
): StageDates {
  const out: StageDates = {};
  const rank = STAGE_RANK[to];
  if (rank >= STAGE_RANK.qualified && !current.qualifiedAt)
    out.qualifiedAt = now;
  if (to === "demo_scheduled" && !current.demoScheduledAt)
    out.demoScheduledAt = now;
  if (to === "converted" && !current.convertedAt) out.convertedAt = now;
  if (to === "lost" && !current.lostAt) out.lostAt = now;
  return out;
}

/** Share as a percentage (one decimal), or null when there is no base. */
export const rate = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
