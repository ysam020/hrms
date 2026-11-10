import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { UserContext } from "@web/app/providers/UserContext";
import {
  PLAN_PRICING,
  PLAN_TIER_LABELS,
  type PlanTier,
} from "@web/shared/constants/billing";
import PrivacyPolicyPage from "@web/pages/legal/PrivacyPolicyPage";
import TermsOfUsePage from "@web/pages/legal/TermsOfUsePage";
import RefundPolicyPage from "@web/pages/legal/RefundPolicyPage";
import { MotionProvider } from "@next/motion";
import Landing from "@next/features/landing/Landing";
import ProductDemo from "@next/features/product-demo/ProductDemo";
import Watch from "@next/features/product-demo/Watch";
import { OG_IMAGE, PUBLIC_PAGES, SITE_NAME, SITE_URL } from "@next/app/seo";
import {
  CDN_CONFIGURED,
  MODULES as DEMO_MODULES,
  ORDER as DEMO_ORDER,
  cdn,
  watchPath,
} from "@next/features/product-demo/catalogue";

// Build-time render of the public pages for scripts/prerender.mjs: the same
// components the app mounts, as an anonymous visitor sees them. The browser
// replaces this markup when the app starts (it doesn't hydrate), so the app's
// session and offline providers aren't needed here.

export { OG_IMAGE, PUBLIC_PAGES, SITE_NAME, SITE_URL };

const PAGES: Record<string, ComponentType> = {
  "/": Landing,
  "/privacy-policy": PrivacyPolicyPage,
  "/terms-of-use": TermsOfUsePage,
  "/refund-policy": RefundPolicyPage,
  "/product-demo": ProductDemo,
};

const anonymous = { user: null, setUser: () => {}, handleLogout: () => {} };

/**
 * /watch/<id>: a page per product video, with that video's own title,
 * description and thumbnail for search results and link previews.
 */
export function watchPages() {
  return DEMO_ORDER.map(({ video }) => ({
    path: watchPath(video.id),
    title: `${video.title} · Praesto`,
    description: video.description,
    // The video's thumbnail when the build knows the CDN (1280×720).
    image: CDN_CONFIGURED
      ? {
          url: cdn(video.thumbnail),
          width: 1280,
          height: 720,
          alt: video.title,
        }
      : null,
  }));
}

export function render(path: string): string {
  const Page = path.startsWith("/watch/") ? Watch : PAGES[path];
  if (!Page) throw new Error(`No prerendered page for ${path}`);
  return renderToString(
    <StaticRouter location={path}>
      <MotionProvider>
        <UserContext.Provider value={anonymous}>
          <Page />
        </UserContext.Provider>
      </MotionProvider>
    </StaticRouter>,
  );
}

const TIERS: PlanTier[] = ["starter", "growth", "enterprise"];

/**
 * JSON-LD for the landing page. Only facts the site itself states: the
 * organisation, its support address and the published monthly prices. No
 * ratings or reviews — there are none to cite.
 */
export function structuredData(path: string): object[] {
  if (path === "/product-demo") return productDemoData();
  if (path.startsWith("/watch/")) return watchData(path);
  if (path !== "/") return [];
  const org = `${SITE_URL}/#organization`;
  return [
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": org,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/icon-512.png`,
          email: "support@praesto.in",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "support@praesto.in",
          },
        },
        {
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          publisher: { "@id": org },
          inLanguage: "en",
        },
        {
          "@type": "SoftwareApplication",
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: PUBLIC_PAGES["/"].description,
          applicationCategory: "BusinessApplication",
          applicationSubCategory: "Human resource management",
          operatingSystem: "Web browser",
          image: OG_IMAGE,
          publisher: { "@id": org },
          offers: TIERS.map((tier) => ({
            "@type": "Offer",
            name: `${PLAN_TIER_LABELS[tier]} (monthly)`,
            price: (PLAN_PRICING[tier].monthly / 100).toFixed(2),
            priceCurrency: "INR",
            url: `${SITE_URL}/#pricing`,
          })),
        },
      ],
    },
  ];
}

/**
 * /product-demo: every demo as a VideoObject, so search engines can list
 * them. Needs the CDN's absolute URLs, so only when the build knows it.
 */
function productDemoData(): object[] {
  if (!CDN_CONFIGURED) return [];
  const iso = (s: number) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Praesto product demos",
      itemListElement: DEMO_MODULES.flatMap((m) => m.videos).map((v, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${watchPath(v.id)}`,
        item: {
          "@type": "VideoObject",
          name: v.title,
          description: v.description,
          thumbnailUrl: cdn(v.thumbnail),
          uploadDate: v.recorded,
          duration: iso(v.duration),
          contentUrl: cdn(v.hls),
          embedUrl: `${SITE_URL}${watchPath(v.id)}`,
          inLanguage: "en",
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: `${SITE_URL}/`,
          },
        },
      })),
    },
  ];
}

/** /watch/<id>: the video as a VideoObject. */
function watchData(path: string): object[] {
  const x = DEMO_ORDER.find((x) => watchPath(x.video.id) === path);
  if (!x || !CDN_CONFIGURED) return [];
  const v = x.video;
  const iso = (s: number) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: v.title,
      description: v.description,
      thumbnailUrl: cdn(v.thumbnail),
      uploadDate: v.recorded,
      duration: iso(v.duration),
      contentUrl: cdn(v.hls),
      embedUrl: `${SITE_URL}${path}`,
      inLanguage: "en",
      hasPart: v.chapters.map((c, i) => ({
        "@type": "Clip",
        name: c.title,
        startOffset: Math.round(c.startTime),
        endOffset: Math.round(v.chapters[i + 1]?.startTime ?? v.duration),
        url: `${SITE_URL}${path}`,
      })),
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: `${SITE_URL}/`,
      },
    },
  ];
}
