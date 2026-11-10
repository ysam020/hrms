// First-touch campaign attribution for the website's lead forms.
//
// On the first public page of a visit, the campaign parameters (utm_*), the
// landing path and the referring site's host are kept in sessionStorage:
// this tab only, gone when it closes, no cookie, nothing sent anywhere. They
// leave the browser only inside a submitted Book a Demo / Contact Sales form,
// where the gateway sanitises them again (config/leads.ts) and stores them
// with the lead in Praesto's own database. They never go to Google Analytics.
//
// Values that look like contact details (an "@", a long run of digits) are
// dropped, and so is anything but short campaign labels.

import { isTrackedPath } from "./analytics";
import { normalizePath } from "./seo";

const KEY = "px-lead-attribution";
const PARAMS: [string, keyof Attribution][] = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_term", "utmTerm"],
  ["utm_content", "utmContent"],
  ["utm_id", "utmId"],
];

export type Attribution = Partial<{
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  utmId: string;
  landingPage: string;
  referrerHost: string;
}>;

const SAFE_VALUE = /^[\p{L}\p{N} _\-.+:/|]+$/u;
const LOOKS_PERSONAL = /@|%40|\d{7,}/;

export function cleanValue(v: string | null): string | undefined {
  const s = v?.trim();
  if (!s || s.length > 100) return undefined;
  return SAFE_VALUE.test(s) && !LOOKS_PERSONAL.test(s) ? s : undefined;
}

/** Attribution for a landing at `pathname` + `search`, from `referrer`. */
export function attributionFrom(
  pathname: string,
  search: string,
  referrer: string,
  ownHost: string,
): Attribution {
  const params = new URLSearchParams(search);
  const out: Attribution = {};
  for (const [param, key] of PARAMS) {
    const v = cleanValue(params.get(param));
    if (v) out[key] = v;
  }
  const path = normalizePath(pathname);
  if (/^\/[A-Za-z0-9\-_/]{0,99}$/.test(path) && !LOOKS_PERSONAL.test(path))
    out.landingPage = path;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host && host !== ownHost) out.referrerHost = host;
  } catch {
    // no referrer, or not a URL
  }
  return out;
}

/** Remember the first public page of this visit (once per tab session). */
export function captureAttribution(pathname: string) {
  if (typeof window === "undefined" || !isTrackedPath(pathname)) return;
  try {
    if (sessionStorage.getItem(KEY)) return;
    const a = attributionFrom(
      pathname,
      window.location.search,
      document.referrer,
      window.location.hostname,
    );
    sessionStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // storage unavailable (private mode, blocked): forms work without it
  }
}

/** What was captured for this visit, to send with a lead form. */
export function readAttribution(): Attribution {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Attribution = {};
    for (const [k, v] of Object.entries(parsed))
      if (typeof v === "string" && v.length <= 253)
        out[k as keyof Attribution] = v;
    return out;
  } catch {
    return {};
  }
}
