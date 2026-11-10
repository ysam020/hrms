import { useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { DemoTeaser } from "./DemoTeaser";
import { Closing } from "./parts";
import {
  FeaturesIntro,
  FeaturesMore,
  ModulesSection,
  Pricing,
  SecuritySection,
} from "./Sections";
import { Platform } from "./Platform";
import { Footer, NavBar } from "./SiteChrome";
import s from "./landing.module.css";
import p from "./pages.module.css";

// The site's sections, each on its own route: /features, /platform,
// /modules, /security and /pricing (Sections.tsx, Platform.tsx; the landing
// page leads to them), under a short page heading and above the closing call
// to action. Prerendered like the landing page (src/app/seo.ts PUBLIC_PAGES,
// src/prerender/entry.tsx).

/** Which nav link a section page lights. */
export type PageKey =
  | "features"
  | "platform"
  | "modules"
  | "security"
  | "pricing";

function SectionPage({
  page,
  eyebrow,
  title,
  lead,
  children,
}: {
  page: PageKey;
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const { user } = useContext(UserContext);
  const signedIn = Boolean(user);
  const { pathname, hash } = useLocation();
  const [overDark, setOverDark] = useState(true);

  // Arriving on a page starts at its top, or at the section a link named
  // (/platform#permissions).
  useEffect(() => {
    const target = hash
      ? document.getElementById(decodeURIComponent(hash.slice(1)))
      : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  // The bar is dark over the heading and the closing section, light
  // elsewhere, as on the landing page.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const dark = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) dark.add(e.target);
          else dark.delete(e.target);
        }
        setOverDark(dark.size > 0);
      },
      { rootMargin: `0px 0px ${32 - window.innerHeight}px 0px` },
    );
    document
      .querySelectorAll("[data-nav-dark]")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  return (
    <div className={s.page}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <NavBar tone={overDark ? "dark" : "light"} user={user} current={page} />
      <main id="main">
        <section className={p.hero} data-nav-dark aria-labelledby="page-title">
          <div className={p.wrap}>
            <p className={p.eyebrow}>{eyebrow}</p>
            <h1 id="page-title" className={p.title}>
              {title}
            </h1>
            <p className={p.lead}>{lead}</p>
          </div>
        </section>
        {children}
        <Closing signedIn={signedIn} />
      </main>
      <Footer signedIn={signedIn} />
    </div>
  );
}

export function FeaturesPage() {
  return (
    <SectionPage
      page="features"
      eyebrow="Features"
      title="Everything HR does in a day, in one place."
      lead="Requests, approvals, attendance, payroll and the people behind them: the everyday work of HR, built to be quick for everyone who touches it."
    >
      <FeaturesIntro />
      <FeaturesMore />
    </SectionPage>
  );
}

export function PlatformPage() {
  return (
    <SectionPage
      page="platform"
      eyebrow="Platform"
      title="Set up to your organisation’s rules."
      lead="Attendance rules and geofencing, your organisation’s settings, roles and permissions, HR policies, reports and notifications: the parts you set up once and Praesto follows every day."
    >
      <Platform />
    </SectionPage>
  );
}

export function ModulesPage() {
  return (
    <SectionPage
      page="modules"
      eyebrow="Modules"
      title="A complete HRMS, from hire to retire."
      lead="Every part of the employee lifecycle shares the same people, the same permissions and the same approvals, so nothing lives in a separate tool."
    >
      <ModulesSection />
      <DemoTeaser />
    </SectionPage>
  );
}

export function SecurityPage() {
  return (
    <SectionPage
      page="security"
      eyebrow="Security"
      title="HR data stays with the people who should see it."
      lead="A database for every organisation, sign-in without passwords, permissions checked on the server, a record of every change, and AI assistants on your terms."
    >
      <SecuritySection />
    </SectionPage>
  );
}

export function PricingPage() {
  const { user } = useContext(UserContext);
  return (
    <SectionPage
      page="pricing"
      eyebrow="Pricing"
      title="Simple plans that grow with your team."
      lead="Every plan includes every module. Start with a 14-day free trial, then choose the plan that fits your headcount."
    >
      <Pricing user={user} />
    </SectionPage>
  );
}
