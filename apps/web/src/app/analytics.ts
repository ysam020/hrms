// Website analytics: Google Tag Manager, which runs the GA4 tag.
//
// Scope: the public marketing pages plus the sign-up path (TRACKED_PATHS).
// Nothing behind sign-in is measured. App URLs and titles carry usernames,
// record ids and people's names, and an HRMS has no business sending its
// users' activity to an ad company.
//
// Why GTM is loaded here, once, rather than as a snippet in index.html's
// <head>:
//  - index.html is also the SPA fallback for every in-app route, so a head
//    snippet would load Google's script on every HR screen.
//  - A Google sign-in returns to "/?oauth_success=1&access_token=…", and the
//    token stays in the address bar until the session boot removes it. The
//    container must not start while it's there (see hasCredentialsInUrl).
//  - The CSP allows no inline scripts, which the stock snippet is.
// The bootstrap below is Google's snippet, run as code. GTM loads at most
// once per document, asynchronously, and only on praesto.in.
//
// GTM's job (configured in the container, see docs/analytics.md): one Google
// tag for G-V2V9JQ9MFT with send_page_view = false, and GA4 event tags fired
// by the dataLayer events pushed here. Page views come only from
// trackPageView, so they can't double up with GTM history triggers or GA4
// Enhanced Measurement, both of which must stay off.
//
// Privacy rules for anything sent from here:
//  - page_location keeps only the path and campaign parameters (no other
//    query string and no hash), and page_title is the fixed public title,
//    never document.title.
//  - Event parameters come from the closed EventParams type: product names
//    and UI positions only, never user, employee or tenant data.

import { PUBLIC_PAGES, SITE_URL, normalizePath } from "./seo";

export const GTM_ID = "GTM-59723TZZ";
export const GA4_MEASUREMENT_ID = "G-V2V9JQ9MFT";
/** Only production is measured; dev, previews and local builds never load GTM. */
export const ANALYTICS_HOSTS = ["praesto.in"];

/** Fixed, PII-free titles for the measured pages. */
export const TRACKED_PATHS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(PUBLIC_PAGES).map(([path, meta]) => [path, meta.title]),
  ),
  // Sign-up (organisation setup) after Google sign-in. Fixed URL, no ids.
  "/org-setup": "Organisation Setup · Praesto",
};

/** Query parameters that may reach GA (campaign attribution only). */
const KEPT_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
];

/** Consent Mode v2 defaults. Analytics is denied where opt-in is the law. */
const CONSENT_REQUIRED_REGIONS = [
  // EEA
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  // UK, Switzerland
  "GB",
  "CH",
];

export type AnalyticsEvent =
  | "sign_up_click"
  | "sign_up_complete"
  | "pricing_view"
  | "cta_click"
  | "outbound_click";

export type CtaLocation =
  | "nav"
  | "mobile_menu"
  | "hero"
  | "pricing"
  | "closing"
  | "footer";

/** Every parameter any event may carry. Keep it free of personal data. */
export type EventParams = {
  cta_id?: "get_started" | "choose_plan" | "sign_in" | "explore_platform";
  cta_location?: CtaLocation;
  plan_tier?: string;
  billing_period?: "monthly" | "annual";
  plan_type?: "trial" | "paid";
  link_domain?: string;
  link_url?: string;
  link_type?: "web" | "email";
};

// Every push resets all parameter keys, so values from an earlier event
// never carry over in GTM's merged dataLayer state.
const PARAM_KEYS: (keyof EventParams)[] = [
  "cta_id",
  "cta_location",
  "plan_tier",
  "billing_period",
  "plan_type",
  "link_domain",
  "link_url",
  "link_type",
];

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = {
  dataLayer?: unknown[];
  [key: `ga-disable-${string}`]: boolean | undefined;
};

let loaded = false;
/** The last tracked page, for de-duplication and page_referrer. */
let lastPage: string | null = null;
/** Whether the current route is measured. */
let active = false;
/** Whether this document has sent a page view (the referrer is for the first). */
let viewed = false;

const w = () => window as unknown as AnalyticsWindow;

export function isTrackedPath(pathname: string): boolean {
  return normalizePath(pathname) in TRACKED_PATHS;
}

/** Signals that must keep GTM off: wrong host or a browser privacy opt-out. */
export function analyticsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (!ANALYTICS_HOSTS.includes(window.location.hostname)) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true) return false;
  if (nav.doNotTrack === "1") return false;
  return true;
}

/** Auth material still in the address bar (OAuth return, magic links). */
function hasCredentialsInUrl(): boolean {
  const { search, hash } = window.location;
  return /(^|[?&#])(access_token|refresh_token|id_token|token|code)=/i.test(
    search + hash,
  );
}

/** Page URL for GA: origin, path and campaign parameters only. */
export function sanitizedLocation(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return `${SITE_URL}${normalizePath(pathname)}${query ? `?${query}` : ""}`;
}

/** Referrer for the first page: another site's origin only, never our own URLs. */
function externalReferrer(): string | undefined {
  try {
    const ref = new URL(document.referrer);
    if (ref.hostname === window.location.hostname) return undefined;
    return ref.origin + "/";
  } catch {
    return undefined;
  }
}

/** Start GTM: Google's container snippet, once per document. */
function loadGtm(): boolean {
  if (loaded) return true;
  if (!analyticsAllowed() || hasCredentialsInUrl()) return false;
  loaded = true;

  const dl = (w().dataLayer = w().dataLayer || []);
  const gtag: Gtag = function () {
    // gtag commands must be pushed as the arguments object.
    // eslint-disable-next-line prefer-rest-params
    dl.push(arguments);
  };
  // Consent defaults go first, before the container starts.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });
  gtag("consent", "default", {
    analytics_storage: "denied",
    region: CONSENT_REQUIRED_REGIONS,
  });
  gtag("set", "ads_data_redaction", true);

  dl.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(script);

  document.addEventListener("click", onDocumentClick, { capture: true });
  return true;
}

/**
 * GA's documented kill switch: while set, the GA4 tag sends nothing,
 * including its own automatic events such as user_engagement.
 */
function setGaEnabled(enabled: boolean) {
  w()[`ga-disable-${GA4_MEASUREMENT_ID}`] = enabled ? undefined : true;
}

function push(event: string, data: Record<string, unknown>) {
  w().dataLayer?.push({ event, ...data });
}

/**
 * Record a page view for the route just shown (called on every pathname
 * change). Measured pages load GTM on first use; anything else switches GA
 * off until the person is back on a measured page.
 */
export function trackPageView(pathname: string) {
  if (typeof window === "undefined") return;
  if (!isTrackedPath(pathname)) {
    active = false;
    lastPage = null;
    if (loaded) setGaEnabled(false);
    return;
  }
  if (!loadGtm()) return;
  const location = sanitizedLocation(pathname, window.location.search);
  // A repeat of the same page (StrictMode, re-render, same-route link).
  if (active && lastPage === location) return;
  const referrer = lastPage ?? (viewed ? undefined : externalReferrer());
  active = true;
  viewed = true;
  setGaEnabled(true);
  push("virtual_page_view", {
    ...Object.fromEntries(PARAM_KEYS.map((k) => [k, undefined])),
    page_location: location,
    page_title: TRACKED_PATHS[normalizePath(pathname)],
    page_referrer: referrer,
  });
  lastPage = location;
}

/** Send a custom event, if the current page is measured. */
export function trackEvent(event: AnalyticsEvent, params: EventParams = {}) {
  if (!active || !loaded) return;
  push(event, {
    ...Object.fromEntries(PARAM_KEYS.map((k) => [k, undefined])),
    ...params,
    page_location: lastPage,
  });
}

/** pricing_view: once per page view of the pricing section. */
let pricingSeenOn: string | null = null;
export function trackPricingView() {
  if (!active || pricingSeenOn === lastPage) return;
  pricingSeenOn = lastPage;
  trackEvent("pricing_view");
}

/** outbound_click for links leaving praesto.in. Domain and path only. */
function onDocumentClick(e: MouseEvent) {
  if (!active) return;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  if (a.protocol === "mailto:")
    return trackEvent("outbound_click", { link_type: "email" });
  if (a.protocol !== "http:" && a.protocol !== "https:") return;
  if (a.hostname === window.location.hostname) return;
  trackEvent("outbound_click", {
    link_type: "web",
    link_domain: a.hostname,
    link_url: `${a.origin}${a.pathname}`,
  });
}

/** Test hook: forget everything this module remembers. */
export function resetAnalyticsForTests() {
  if (loaded)
    document.removeEventListener("click", onDocumentClick, { capture: true });
  loaded = false;
  active = false;
  viewed = false;
  lastPage = null;
  pricingSeenOn = null;
}
