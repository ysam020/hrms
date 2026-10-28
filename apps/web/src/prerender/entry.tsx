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
import { OG_IMAGE, PUBLIC_PAGES, SITE_NAME, SITE_URL } from "@next/app/seo";

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
};

const anonymous = { user: null, setUser: () => {}, handleLogout: () => {} };

export function render(path: string): string {
  const Page = PAGES[path];
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
