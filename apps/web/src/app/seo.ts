// Search and social metadata for the public pages. The build prerenders these
// pages to static HTML (src/prerender/entry.tsx, scripts/prerender.mjs) with
// this metadata in <head>; the running app keeps <head> in step as people
// navigate (applyPageMeta, called from SessionRoot). Everything behind sign-in
// is marked noindex.

export const SITE_URL = "https://praesto.in";
export const SITE_NAME = "Praesto";
/** 1200 × 630 social card: a real Praesto screen with fictional records. */
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export type PageMeta = {
  title: string;
  description: string;
  /** Built to static HTML and listed in sitemap.xml. */
  prerender?: boolean;
};

export const PUBLIC_PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Praesto | HRMS Software for Attendance, Leave & Payroll",
    description:
      "Praesto is HRMS software for growing businesses, combining employee attendance, leave management, recruitment, payroll and analytics in one workspace.",
    prerender: true,
  },
  "/privacy-policy": {
    title: "Privacy Policy · Praesto",
    description:
      "What personal data Praesto collects, how it is used and protected, and the choices available to visitors, organisations and their employees.",
    prerender: true,
  },
  "/terms-of-use": {
    title: "Terms of Use · Praesto",
    description:
      "The terms that govern access to and use of the Praesto HR management platform and website.",
    prerender: true,
  },
  "/refund-policy": {
    title: "Refund & Cancellation Policy · Praesto",
    description:
      "How Praesto subscriptions are billed, how to cancel, and how refunds are handled.",
    prerender: true,
  },
  "/login": {
    title: "Sign In · Praesto",
    description:
      "Sign in to Praesto with Google or a passkey to reach your organisation’s HR workspace.",
  },
};

export function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/** Public pages, plus organisations' careers pages, may be indexed. */
export function isIndexable(path: string): boolean {
  const p = normalizePath(path);
  return p in PUBLIC_PAGES || p.startsWith("/careers/");
}

/**
 * The path this document arrived prerendered for, if any. Its content is
 * already on screen when React mounts, so pages skip their entrance
 * animations rather than hide and re-reveal it.
 */
const prerenderedPath =
  typeof document === "undefined"
    ? null
    : (document.querySelector<HTMLElement>("#root [data-prerender]")?.dataset
        .prerender ?? null);

export function arrivedPrerendered(path: string): boolean {
  // While prerendering (no DOM) every page renders in its settled state.
  if (typeof document === "undefined") return true;
  return prerenderedPath !== null && prerenderedPath === normalizePath(path);
}

/** Set (or, with null, remove) one <meta>/<link> in <head>. */
function setTag(
  tag: "meta" | "link",
  key: string,
  name: string,
  attr: string,
  value: string | null,
) {
  let el = document.head.querySelector(`${tag}[${key}="${name}"]`);
  if (value === null) return el?.remove();
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: "name" | "property", name: string, content: string | null) =>
  setTag("meta", key, name, "content", content);
const canonical = (href: string | null) =>
  setTag("link", "rel", "canonical", "href", href);

/**
 * The document's own <title> (index.html's, or the prerendered page's),
 * taken before React mounts. Screens in the app render a <title> of their
 * own, which React places ahead of this one and owns; this module only ever
 * writes to the document's.
 */
const documentTitle =
  typeof document === "undefined"
    ? null
    : document.head.querySelector<HTMLTitleElement>("title");

function setDocumentTitle(text: string) {
  if (documentTitle?.isConnected) documentTitle.textContent = text;
  else document.title = text;
}

/** Bring <head> in line with the page at `pathname`. */
export function applyPageMeta(pathname: string) {
  const path = normalizePath(pathname);
  const page = PUBLIC_PAGES[path];
  if (page) {
    setDocumentTitle(page.title);
    const url = `${SITE_URL}${path === "/" ? "/" : path}`;
    meta("name", "description", page.description);
    meta("property", "og:title", page.title);
    meta("property", "og:description", page.description);
    meta("property", "og:url", url);
    canonical(url);
  } else {
    // Each screen renders its own <title>; this is what shows without one.
    setDocumentTitle(SITE_NAME);
    meta("name", "description", null);
    meta("property", "og:url", null);
    canonical(isIndexable(path) ? `${SITE_URL}${path}` : null);
  }
  meta("name", "robots", isIndexable(path) ? null : "noindex");
}
