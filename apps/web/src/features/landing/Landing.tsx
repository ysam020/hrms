import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { UserContext } from "@web/app/providers/UserContext";
import { Icon, type IconName } from "@next/ui";
import { arrivedPrerendered } from "@next/app/seo";
import { trackEvent } from "@next/app/analytics";
import { Arrow, Footer, NavBar, Roll } from "./SiteChrome";
import { MacBookShowcase, type ShowcaseScene } from "./MacBookShowcase";
import { DemoTeaser } from "./DemoTeaser";
import {
  MaskedLines,
  Reveal,
  RevealItem,
  dur,
  ease,
  stagger,
  useAmbient,
  usePointerDepth,
} from "./motion";
import { Closing, SHOT, Shot } from "./parts";
import s from "./landing.module.css";

/**
 * The public landing page at "/": the hero, a way into each part of the site
 * (Features, Platform, Modules, Security and Pricing each have their own
 * page: Pages.tsx, Sections.tsx), the product demos, and the closing call to
 * action. Everything on it is static: the product imagery is real Praesto
 * screens captured from a development build with fictional records
 * (public/images/product-showcase). Nothing here calls the API.
 *
 * Getting started is Praesto's real onboarding: sign in with Google, and an
 * account without an organisation is taken through organisation setup and
 * checkout. So "Start Free Trial" and "Sign In" both lead to /login.
 */

const SCENES: ShowcaseScene[] = [
  {
    id: "today",
    label: "Overview",
    title: "Your day, at a glance.",
    body: "Hours worked, the requests waiting on you and what’s coming up — on one screen.",
    src: `${SHOT}/today.webp`,
    alt: "Praesto’s Today screen: hours worked so far, a month of attendance, four requests awaiting a decision and upcoming events.",
  },
  {
    id: "people",
    label: "People",
    title: "Everyone, in one directory.",
    body: "Every employee with their role, department, joining date and KYC status.",
    src: `${SHOT}/employees.webp`,
    alt: "Praesto’s employee directory listing names, designations, departments, joining dates and KYC status.",
  },
  {
    id: "attendance",
    label: "Attendance",
    title: "Every workday, accounted for.",
    body: "Punches, hours and status for the month, with corrections tracked against your policy.",
    src: `${SHOT}/attendance.webp`,
    alt: "Praesto’s attendance screen for October with present days, paid leave, corrections left and a day-by-day table.",
  },
  {
    id: "hiring",
    label: "Hiring",
    title: "Your hiring funnel, clearly.",
    body: "Applicants at every stage, by role and by hiring manager.",
    src: `${SHOT}/recruitment.webp`,
    alt: "Praesto’s recruitment analytics: a hiring funnel from applied to hired, applications by role and openings by status.",
  },
  {
    id: "payroll",
    label: "Payroll",
    title: "Payroll, run by run.",
    body: "Take each month from draft to approved to disbursed, with gross and net totals.",
    src: `${SHOT}/payroll.webp`,
    alt: "Praesto’s payroll runs: six months of runs with employee counts, gross and net totals and their status.",
  },
];

/**
 * Arrived as prerendered HTML: everything is already on screen, so nothing
 * fades in (it would vanish and reappear). Client-side visits still animate.
 */
const settled = () => arrivedPrerendered("/");

export default function Landing() {
  const { user } = useContext(UserContext);
  const signedIn = Boolean(user);
  const [overDark, setOverDark] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const [still] = useState(settled);

  // The bar takes the tone of whatever section is under it: dark over the
  // hero, security and closing sections, light everywhere else. The same
  // line under the bar decides which nav link is current.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const dark = new Set<Element>();
    const under = new Set<HTMLElement>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const set = el.dataset.nav ? under : dark;
          if (e.isIntersecting) set.add(el);
          else set.delete(el);
        }
        setOverDark(dark.size > 0);
        setCurrent([...under][0]?.dataset.nav ?? null);
      },
      { rootMargin: `0px 0px ${32 - window.innerHeight}px 0px` },
    );
    document
      .querySelectorAll("[data-nav-dark], [data-nav]")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={s.page}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <NavBar
        tone={overDark ? "dark" : "light"}
        user={user}
        current={current}
      />

      <main id="main">
        <Hero still={still} signedIn={signedIn} />
        <Explore />
        <DemoTeaser />
        <Closing signedIn={signedIn} />
      </main>

      <Footer signedIn={signedIn} />
    </div>
  );
}

// ── Sections, shared by the landing page and the section pages ───────────
// (Pages.tsx: /features, /platform, /modules, /security, /pricing).

/**
 * Two real cards from the Today screen, lifted off the laptop as floating
 * layers. They sit in front of the screen in 3D, so the pointer tilt gives
 * them their own parallax, and they drift slowly while the hero is in view.
 */
const FLOATS = [
  {
    id: "day",
    crop: { x: 276, y: 272, w: 345, h: 132 },
    side: "left",
  },
  {
    id: "workforce",
    crop: { x: 1062, y: 700, w: 340, h: 182 },
    side: "right",
  },
] as const;

function Hero({ still, signedIn }: { still: boolean; signedIn: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const pointer = usePointerDepth(ref);
  useAmbient(ref);
  return (
    <section
      ref={ref}
      className={s.hero}
      data-nav-dark
      aria-labelledby="hero-title"
    >
      {/* Ambient light: three soft fields drifting on 16–26 s loops. */}
      <div className={s.aurora} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={s.heroCopy}>
        {/* The page's subject is the heading; the brand line below is
            the headline people see. Its lines rise out of a slot, then
            the lead, the actions and the product follow. */}
        <motion.h1
          id="hero-title"
          className={s.eyebrow}
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.text, delay: 0.1, ease: ease.out }}
        >
          HRMS software for attendance, leave and payroll
        </motion.h1>
        <p className={s.heroTitle}>
          <MaskedLines
            lines={["People operations,", "beautifully connected."]}
            play={!still}
            delay={0.18}
            lineClassName={s.line}
            innerClassName={s.lineInner}
          />
        </p>
        <motion.p
          className={s.heroLead}
          initial={still ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.text, delay: 0.5, ease: ease.out }}
        >
          Praesto is HR software that brings attendance, leave, hiring, payroll
          and approvals together in one workspace — set up to your
          organisation’s rules, with access that fits each person’s role.
        </motion.p>
        <motion.div
          className={s.actions}
          initial={still ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.text, delay: 0.62, ease: ease.out }}
        >
          <Link
            to={signedIn ? "/dashboard" : "/login"}
            className={`${s.cta} ${s.ctaPrimary} ${s.ctaRoll}`}
            onClick={() =>
              !signedIn &&
              trackEvent("sign_up_click", {
                cta_id: "start_trial",
                cta_location: "hero",
              })
            }
          >
            <Roll>{signedIn ? "Open Dashboard" : "Start Free Trial"}</Roll>
            <span className={s.chip} aria-hidden="true">
              <Arrow />
            </span>
          </Link>
          {signedIn ? (
            <Link
              to="/features"
              className={`${s.cta} ${s.ctaGhost}`}
              onClick={() =>
                trackEvent("cta_click", {
                  cta_id: "explore_platform",
                  cta_location: "hero",
                })
              }
            >
              <Roll>Explore the Platform</Roll>
              <Arrow />
            </Link>
          ) : (
            <Link
              to="/book-demo"
              className={`${s.cta} ${s.ctaGhost}`}
              onClick={() =>
                trackEvent("cta_click", {
                  cta_id: "book_demo",
                  cta_location: "hero",
                })
              }
            >
              <Roll>Book a Demo</Roll>
            </Link>
          )}
        </motion.div>
      </div>

      <motion.div
        className={s.heroDevice}
        initial={still ? false : { opacity: 0, y: 56 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur.media, delay: 0.75, ease: ease.out }}
      >
        <MacBookShowcase
          scenes={SCENES}
          label="Praesto product tour"
          priority
          settle
          pointer={pointer}
          overlay={FLOATS.map((f, i) => (
            <motion.div
              key={f.id}
              className={s.float}
              data-side={f.side}
              aria-hidden="true"
              initial={
                still
                  ? false
                  : { opacity: 0, x: f.side === "left" ? -48 : 48, y: 24 }
              }
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{
                duration: dur.media,
                delay: 1.2 + i * 0.15,
                ease: ease.out,
              }}
            >
              <div className={s.floatBob}>
                <Shot src={`${SHOT}/today.webp`} alt="" crop={f.crop} />
              </div>
            </motion.div>
          ))}
        />
      </motion.div>
    </section>
  );
}

// ── Building blocks ────────────────────────────────────────────────────────

// ── Explore ────────────────────────────────────────────────────────────────

/** Each part of the site has its own page (Pages.tsx); the landing page
 *  leads to them. */
const EXPLORE: { to: string; icon: IconName; title: string; body: string }[] = [
  {
    to: "/features",
    icon: "sparkle",
    title: "Features",
    body: "Requests, approvals, attendance with face punch-in, and an AI assistant, on any device.",
  },
  {
    to: "/platform",
    icon: "gear",
    title: "Platform",
    body: "Attendance rules and geofencing, roles and permissions, policies, reports and notifications.",
  },
  {
    to: "/modules",
    icon: "checklist",
    title: "Modules",
    body: "Every part of the employee lifecycle, from the first application to the last working day.",
  },
  {
    to: "/security",
    icon: "shield",
    title: "Security",
    body: "A database for every organisation, passwordless sign-in and a complete audit trail.",
  },
  {
    to: "/pricing",
    icon: "banknote",
    title: "Pricing",
    body: "One price by headcount, every module included, and a 14-day free trial.",
  },
];

function Explore() {
  return (
    <section
      className={`${s.section} ${s.explore}`}
      aria-labelledby="explore-title"
    >
      <Reveal className={s.galleryHead}>
        <h2 id="explore-title" className={s.h2}>
          Explore Praesto.
        </h2>
        <p className={s.lead}>
          See how each part of Praesto works, then try it with your own team.
        </p>
      </Reveal>
      <Reveal
        as="ul"
        className={s.exploreGrid}
        kind="group"
        delay={0.06}
        stagger={stagger.items}
      >
        {EXPLORE.map((e) => (
          <RevealItem as="li" key={e.to}>
            <Link to={e.to} className={s.exploreCard}>
              <span className={s.exploreIcon}>
                <Icon name={e.icon} size={20} />
              </span>
              <span className={s.exploreTitle}>
                {e.title} <Arrow />
              </span>
              <span className={s.exploreBody}>{e.body}</span>
            </Link>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}
