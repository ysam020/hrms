import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import {
  PLAN_PRICING,
  PLAN_TIER_LABELS,
  TIER_EMPLOYEE_LIMITS,
  type Billing,
  type PlanTier,
} from "@web/shared/constants/billing";
import { PLAN_FEATURES } from "@web/features/auth/org-setup/constants";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import { Icon, type IconName } from "@next/ui";
import { trackEvent, trackPricingView } from "@next/app/analytics";
import { Arrow, Roll } from "./SiteChrome";
import { MacBookShowcase, type ShowcaseScene } from "./MacBookShowcase";
import { Abilities } from "./Abilities";
import { LeaveFlow } from "./LeaveFlow";
import {
  Reveal,
  RevealItem,
  dur,
  ease,
  stagger,
  useEntrance,
  usePointerDepth,
} from "./motion";
import { LitSection, SHOT, Shot } from "./parts";
import s from "./landing.module.css";

// The landing page's sections, each shown on its own page (Pages.tsx):
// /features, /platform (Platform.tsx), /modules, /security and /pricing.

/** The rest of the workspace, for the second showcase. */
const MORE_SCENES: ShowcaseScene[] = [
  {
    id: "calendar",
    label: "Calendar",
    title: "One calendar for the whole company.",
    body: "Events and holidays across the month, with today’s schedule beside them.",
    src: `${SHOT}/calendar.webp`,
    alt: "Praesto’s calendar for October with company events, a holiday and today’s schedule.",
  },
  {
    id: "settings",
    label: "Settings",
    title: "Set up the way you hire.",
    body: "Define interview rounds, who owns each one and where background verification happens.",
    src: `${SHOT}/settings.webp`,
    alt: "Praesto’s recruitment pipeline settings with a three-round default pipeline and an interns pipeline.",
  },
  {
    id: "audit",
    label: "Audit Log",
    title: "Every change, before and after.",
    body: "See who changed what, when and from where — field by field.",
    src: `${SHOT}/audit-log.webp`,
    alt: "Praesto’s audit log with an attendance-settings change open, showing each field’s value before and after.",
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    title: "Requests with an owner and a deadline.",
    body: "Each ticket carries a priority, an SLA due date and a conversation, with internal notes for your team.",
    src: `${SHOT}/helpdesk.webp`,
    alt: "A Praesto helpdesk ticket with its status, priority, SLA due date and a conversation including an internal note.",
  },
  {
    id: "announcements",
    label: "Announcements",
    title: "News that reaches everyone.",
    body: "Post announcements to the whole organisation, and keep past ones on record.",
    src: `${SHOT}/announcements.webp`,
    alt: "Praesto’s announcements screen listing three current company announcements.",
  },
  {
    id: "payslips",
    label: "Payslips",
    title: "Payslips without the email chain.",
    body: "People see their net pay, deductions and TDS, and download their own payslips.",
    src: `${SHOT}/payslips.webp`,
    alt: "Praesto’s payslips screen with the latest net pay and four months of payslips to download.",
  },
  {
    id: "billing",
    label: "Billing",
    title: "Your plan, in plain sight.",
    body: "See your plan, renewal date and payment method, and change plans as you grow.",
    src: `${SHOT}/subscription.webp`,
    alt: "Praesto’s subscription screen showing an active Growth plan, its renewal date and plan options.",
  },
];

/** Feature cards that stack as the page scrolls. */
const STACK: {
  id: string;
  label: string;
  title: string;
  body: string;
  src: string;
  alt: string;
  crop: { x: number; y: number; w: number; h: number };
  /** How the screen arrives as the card scrolls in (CSS, scroll-driven):
   *  tilt — rises out of a backward lean; wipe — draws in left to right,
   *  like the charts on it; swing — turns in from the side. */
  fx: "tilt" | "wipe" | "swing";
}[] = [
  {
    id: "approvals",
    fx: "tilt",
    label: "Approvals",
    title: "Every request. One inbox.",
    body: "Leave, work from home, salary advances and KYC reviews arrive in one place. Decide in a tap: each request goes to the requester’s team lead, or to an owner or admin when there isn’t one.",
    src: `${SHOT}/today.webp`,
    alt: "Praesto’s list of requests needing a decision: casual leave, work from home and a salary advance with Approve and Reject, and a KYC review.",
    crop: { x: 272, y: 524, w: 760, h: 336 },
  },
  {
    id: "organisation",
    fx: "tilt",
    label: "Organisation",
    title: "Your organisation, mapped.",
    body: "See who leads each team and who belongs where. Permissions follow the structure, scoped to a person’s own records, their team or everyone.",
    src: `${SHOT}/organisation.webp`,
    alt: "Praesto’s organisation view: the founder, five teams with their leads, and headcount totals.",
    crop: { x: 268, y: 0, w: 900, h: 560 },
  },
  {
    id: "hiring",
    fx: "wipe",
    label: "Recruitment",
    title: "Hiring you can follow.",
    body: "Track every applicant from application to offer, with the funnel, roles and hiring managers at a glance.",
    src: `${SHOT}/recruitment.webp`,
    alt: "Praesto’s recruitment analytics: a hiring funnel from applied to hired, applications by role and openings by status.",
    crop: { x: 268, y: 0, w: 1100, h: 640 },
  },
  {
    id: "insight",
    fx: "wipe",
    label: "Analytics",
    title: "Answers, not spreadsheets.",
    body: "Workforce, attendance, recruitment and salary analytics are built in. When you need something specific, the report builder exports to CSV.",
    src: `${SHOT}/analytics.webp`,
    alt: "Praesto’s workforce analytics: headcount growth by month, new joiners, employment status and department breakdown.",
    crop: { x: 268, y: 0, w: 1100, h: 640 },
  },
  {
    id: "chat",
    fx: "swing",
    label: "Chat",
    title: "Conversations where the work is.",
    body: "One-to-one chat with replies, pinned messages, files and read receipts, right next to the rest of your HR.",
    src: `${SHOT}/chat.webp`,
    alt: "Praesto’s chat: a conversation with a reply, a pinned message and read receipts.",
    crop: { x: 256, y: 0, w: 1184, h: 600 },
  },
];

const MODULES: { group: string; items: string[] }[] = [
  {
    group: "People",
    items: ["Employees", "Organisation", "KYC", "Resignations", "Assets"],
  },
  {
    group: "Time",
    items: ["Attendance", "Leave", "Work from home", "Holidays", "Calendar"],
  },
  {
    group: "Talent & pay",
    items: ["Recruitment", "Performance", "Payroll", "Salary advances", "Tax"],
  },
  {
    group: "Workplace",
    items: ["Approvals", "Announcements", "Policies", "Helpdesk", "Chat"],
  },
  {
    group: "Insight & control",
    items: ["Analytics", "Reports", "Audit log", "Permissions", "Settings"],
  },
];

const SECURITY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "A database for every organisation",
    body: "Your data lives in its own database — not in rows of a table shared with other companies.",
  },
  {
    icon: "key",
    title: "No passwords to steal",
    body: "People sign in with Google or with a passkey on their own device.",
  },
  {
    icon: "shield",
    title: "Permissions enforced on the server",
    body: "Access is checked on every request, scoped to self, team or everyone — not just hidden in the menu.",
  },
  {
    icon: "doc",
    title: "A complete audit trail",
    body: "Every change is recorded with its before and after values. Sensitive fields are redacted first.",
  },
  {
    icon: "assistant",
    title: "AI assistants on your terms",
    body: "Assistants connect over MCP and sign in as the person: they see only what that person can see and allowed, can’t change anything, and every call is in the audit log.",
  },
];

const TIERS: PlanTier[] = ["starter", "growth", "enterprise"];

/** "Built for the way people work" and "One request, start to finish". */
export function FeaturesIntro() {
  return (
    <>
      <section
        className={s.stackSection}
        data-nav="features"
        aria-labelledby="features-title"
      >
        <Reveal className={s.galleryHead}>
          <h2 id="features-title" className={s.h2}>
            Built for the way people work.
          </h2>
          <p className={s.lead}>
            The everyday work of HR, from the first request of the morning to
            the last payroll run of the month.
          </p>
        </Reveal>
        <Stack />
      </section>

      <section
        id="how-it-works"
        className={s.section}
        data-nav="features"
        aria-labelledby="flow-title"
      >
        <Reveal className={s.galleryHead}>
          <h2 id="flow-title" className={s.h2}>
            One request, start to finish.
          </h2>
          <p className={s.lead}>
            Follow a day of leave through Praesto, from the employee who asks to
            the record that keeps it.
          </p>
          <p className={s.note}>
            An illustration using the app’s own labels. The people and dates are
            fictional.
          </p>
        </Reveal>
        <LeaveFlow />
      </section>
    </>
  );
}

/** "Wherever the work happens", "Ready for the real workday" and "And
 *  everything around it". */
export function FeaturesMore() {
  return (
    <>
      <section
        className={s.anywhere}
        data-nav="features"
        aria-labelledby="anywhere-title"
      >
        <Reveal className={s.galleryHead}>
          <h2 id="anywhere-title" className={s.h2}>
            Wherever the work happens.
          </h2>
          <p className={s.lead}>
            Approve a request between meetings, check your hours on the way
            home, pick up a conversation from anywhere. Praesto is there on a
            phone, a tablet or a laptop, with nothing to install.
          </p>
        </Reveal>
        <Phones />
      </section>

      <section
        id="abilities"
        className={`${s.section} ${s.abilities}`}
        data-nav="features"
        aria-labelledby="abilities-title"
      >
        <Reveal className={s.galleryHead}>
          <h2 id="abilities-title" className={s.h2}>
            Ready for the real workday.
          </h2>
          <p className={s.lead}>
            Punch in with your face, keep working when the signal drops, and ask
            your own AI assistant instead of digging through menus.
          </p>
        </Reveal>
        <Abilities />
      </section>

      <section
        id="more"
        className={`${s.section} ${s.gallery}`}
        aria-labelledby="more-title"
      >
        <Reveal className={s.galleryHead}>
          <h2 id="more-title" className={s.h2}>
            And everything around it.
          </h2>
          <p className={s.lead}>
            The tools your organisation reaches for every day, in the same
            workspace as everything else.
          </p>
        </Reveal>
        <Reveal kind="media" delay={0.06}>
          <TiltShowcase scenes={MORE_SCENES} label="More of Praesto" />
        </Reveal>
      </section>
    </>
  );
}

/** The module index. */
export function ModulesSection() {
  return (
    <section
      id="modules"
      className={`${s.section} ${s.tintSection}`}
      data-nav="modules"
      aria-labelledby="modules-title"
    >
      <Reveal className={s.sectionHead}>
        <h2 id="modules-title" className={s.h2}>
          Twenty-five modules. One workspace.
        </h2>
        <p className={s.lead}>
          A complete HRMS: from someone’s first application to their last
          working day, every part of the employee lifecycle shares the same
          people, the same permissions and the same approvals.
        </p>
      </Reveal>
      {/* The index fills in column by column, like a contents page. */}
      <Reveal
        className={s.modules}
        kind="group"
        delay={0.06}
        stagger={stagger.columns}
      >
        {MODULES.map((g) => (
          <RevealItem key={g.group} className={s.moduleGroup}>
            <h3 className={s.moduleHead}>{g.group}</h3>
            <ul className={s.moduleList}>
              {g.items.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

/** "Private by design". */
export function SecuritySection() {
  return (
    <LitSection
      id="security"
      className={`${s.section} ${s.dark} ${s.lit}`}
      data-nav-dark
      aria-labelledby="security-title"
      spotlight
    >
      <Reveal className={s.sectionHead}>
        <h2 id="security-title" className={s.h2}>
          Private by design.
        </h2>
        <p className={s.lead}>
          HR data is the most personal data a company holds. Praesto is built so
          it stays with the people who should see it.
        </p>
      </Reveal>
      <Reveal className={s.securityShot} kind="media" delay={0.04}>
        <Shot
          src={`${SHOT}/audit-log.webp`}
          alt="Praesto’s audit log with a settings change open, listing each field’s value before and after."
          crop={{ x: 268, y: 0, w: 1172, h: 700 }}
        />
      </Reveal>
      <Reveal className={s.security} kind="group" stagger={stagger.items}>
        {SECURITY.map((f) => (
          <RevealItem key={f.title} className={s.securityItem}>
            <Icon name={f.icon} size={20} className={s.securityIcon} />
            <h3 className={s.h3}>{f.title}</h3>
            <p>{f.body}</p>
          </RevealItem>
        ))}
      </Reveal>
    </LitSection>
  );
}

/**
 * The feature deck. Each card pins a little lower than the last (CSS); as the
 * next one slides over it, the cards underneath shrink a step, so the deck
 * reads as a stack being dealt rather than cards sliding over each other.
 */
function Stack() {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return (
    <ol ref={ref} className={s.stack}>
      {STACK.map((c, i) => (
        <StackCard
          key={c.id}
          card={c}
          i={i}
          progress={scrollYProgress}
          still={Boolean(reduce)}
        />
      ))}
    </ol>
  );
}

function StackCard({
  card: c,
  i,
  progress,
  still,
}: {
  card: (typeof STACK)[number];
  i: number;
  progress: MotionValue<number>;
  /** Reduce Motion: the cards don't shrink (or pin; see the CSS). */
  still: boolean;
}) {
  const n = STACK.length;
  const range = [i / n, 1];
  const scale = useTransform(progress, range, [1, 1 - (n - 1 - i) * 0.03]);
  // Covered cards also fall into shade, so the top card always reads first.
  const dim = useTransform(progress, range, [
    0,
    Math.min(0.32, (n - 1 - i) * 0.09),
  ]);
  return (
    <motion.li
      className={s.stackCard}
      data-fx={c.fx}
      style={{
        ["--i" as string]: i,
        ...(still ? {} : { scale, ["--dim" as string]: dim }),
      }}
      aria-labelledby={`${c.id}-title`}
    >
      <Reveal className={s.stackCopy} kind="left">
        <span className={s.stackLabel}>{c.label}</span>
        <h3 id={`${c.id}-title`} className={s.stackTitle}>
          {c.title}
        </h3>
        <p className={s.stackBody}>{c.body}</p>
      </Reveal>
      <div className={s.stackShot}>
        <Shot src={c.src} alt={c.alt} crop={c.crop} />
      </div>
    </motion.li>
  );
}

/**
 * The phones arrive together: the front one rises, and the two beside it
 * fan out from behind it.
 */
function Phones() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useEntrance(ref);
  const reduce = useReducedMotion();
  // Scroll parallax: the side phones travel further than the front one, so
  // the row separates into depth as it passes.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const sideY = useTransform(scrollYProgress, [0, 1], [90, -90]);
  const farY = useTransform(scrollYProgress, [0, 1], [140, -60]);
  const frontY = useTransform(scrollYProgress, [0, 1], [30, -30]);
  const fan = (from: string): Variants => ({
    hidden: { opacity: 0, x: from, transition: { duration: 0 } },
    shown: {
      opacity: 1,
      x: 0,
      transition: { duration: dur.media, ease: ease.out, delay: 0.2 },
    },
  });
  // Scale, not travel: y belongs to the scroll parallax.
  const front: Variants = {
    hidden: { opacity: 0, scale: 0.92, transition: { duration: 0 } },
    shown: {
      opacity: 1,
      scale: 1,
      transition: { duration: dur.media, ease: ease.out },
    },
  };
  return (
    <motion.div ref={ref} className={s.phones} initial={false} animate={state}>
      <motion.div
        className={s.phoneSlot}
        variants={fan("55%")}
        style={reduce ? undefined : { y: sideY }}
      >
        <Phone
          src={`${SHOT}/mobile-approvals.webp`}
          alt="Praesto on a phone: the Approvals inbox with leave, work-from-home, salary advance and KYC requests."
        />
      </motion.div>
      <motion.div
        className={s.phoneSlot}
        data-front
        variants={front}
        style={reduce ? undefined : { y: frontY }}
      >
        <Phone
          src={`${SHOT}/mobile-today.webp`}
          alt="Praesto on a phone: the Today screen with hours worked, a month of attendance and requests to decide."
          front
        />
      </motion.div>
      <motion.div
        className={s.phoneSlot}
        variants={fan("-55%")}
        style={reduce ? undefined : { y: farY }}
      >
        <Phone
          src={`${SHOT}/mobile-chat.webp`}
          alt="Praesto on a phone: a chat conversation with a pinned message and a reply."
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * A real Praesto screen (captured at 390 × 797, below the status bar) in an
 * iPhone drawn in CSS. Everything is sized in `em`, so one font-size on the
 * row scales the whole device.
 */
function Phone({
  src,
  alt,
  front,
}: {
  src: string;
  alt: string;
  front?: boolean;
}) {
  return (
    <figure className={s.phone} data-front={front || undefined}>
      <div className={s.phoneScreen}>
        <div className={s.statusBar} aria-hidden="true">
          <span className={s.statusTime}>9:41</span>
          <span className={s.island} />
          <svg className={s.statusIcons} viewBox="0 0 68 12">
            <g fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="4.5" y="6" width="3" height="6" rx="1" />
              <rect x="9" y="3.5" width="3" height="8.5" rx="1" />
              <rect x="13.5" y="1" width="3" height="11" rx="1" />
              <path d="M30 3.2a10 10 0 0 1 12 0l-1.3 1.6a8 8 0 0 0-9.4 0Zm2.4 3a6 6 0 0 1 7.2 0l-1.3 1.6a4 4 0 0 0-4.6 0Zm3.6 2.4 1.6 1.9a1 1 0 0 1-3.2 0Z" />
              <rect
                x="47"
                y="1.5"
                width="18"
                height="9"
                rx="2.6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.4"
              />
              <rect x="48.8" y="3.3" width="12" height="5.4" rx="1.4" />
              <rect
                x="66"
                y="4.3"
                width="1.6"
                height="3.4"
                rx="0.8"
                opacity="0.4"
              />
            </g>
          </svg>
        </div>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={390}
          height={797}
        />
        <span className={s.homeBar} aria-hidden="true" />
      </div>
    </figure>
  );
}

/** The second showcase, tilting toward the pointer like the hero's. */
function TiltShowcase({
  scenes,
  label,
}: {
  scenes: ShowcaseScene[];
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = usePointerDepth(ref);
  return (
    <div ref={ref}>
      <MacBookShowcase
        scenes={scenes}
        label={label}
        interval={6000}
        pointer={pointer}
      />
    </div>
  );
}

// ── Pricing ────────────────────────────────────────────────────────────────

/** Rupees from paise, with paise shown only when there are any. */
function rupees(paise: number) {
  const v = paise / 100;
  const frac = Math.round(v * 100) % 100 !== 0;
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: frac ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function seats(tier: PlanTier) {
  const i = TIERS.indexOf(tier);
  const limit = TIER_EMPLOYEE_LIMITS[tier];
  const prev = i > 0 ? TIER_EMPLOYEE_LIMITS[TIERS[i - 1]] : null;
  if (limit === null) return `More than ${prev} employees`;
  return prev === null
    ? `Up to ${limit} employees`
    : `${prev + 1}–${limit} employees`;
}

// Annual billing's saving, computed from the prices themselves.
const ANNUAL_SAVING = Math.round(
  (1 - PLAN_PRICING.starter.annual / (PLAN_PRICING.starter.monthly * 12)) * 100,
);

export function Pricing({ user }: { user: any }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  // Signed in: plans are managed on the Subscription page, by those allowed.
  const manage = user ? hasSubscriptionAccess(user) : false;
  const options: { value: Billing; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "annual", label: "Annual" },
  ];

  // pricing_view: the plans were actually on screen (once per page view).
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        trackPricingView();
        io.disconnect();
      },
      // In the upper 60% of the viewport, however tall the section is.
      { rootMargin: "0px 0px -40% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className={s.section}
      data-nav="pricing"
      aria-labelledby="pricing-title"
    >
      <Reveal className={s.sectionHead}>
        <h2 id="pricing-title" className={s.h2}>
          One price for your whole organisation.
        </h2>
        <p className={s.lead}>
          A flat monthly or yearly price set by headcount — not a charge per
          employee. Every plan includes every module.
        </p>
      </Reveal>

      <Reveal className={s.pricing} delay={0.06}>
        <div
          className={s.billing}
          role="radiogroup"
          aria-label="Billing period"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={billing === o.value}
              className={s.billingOption}
              onClick={() => setBilling(o.value)}
            >
              {/* The selected background slides between the options. */}
              {billing === o.value && (
                <motion.span
                  layoutId="landing-billing"
                  className={s.billingThumb}
                  transition={{ duration: dur.state, ease: ease.state }}
                />
              )}
              {o.label}
              {o.value === "annual" && ANNUAL_SAVING > 0 && (
                <span className={s.save}>Save {ANNUAL_SAVING}%</span>
              )}
            </button>
          ))}
        </div>

        <div className={s.plans}>
          {TIERS.map((tier) => {
            const price = PLAN_PRICING[tier][billing];
            return (
              <article
                key={tier}
                className={s.plan}
                aria-labelledby={`plan-${tier}`}
              >
                <h3 id={`plan-${tier}`} className={s.planName}>
                  {PLAN_TIER_LABELS[tier]}
                </h3>
                <p className={s.planSeats}>{seats(tier)}</p>
                <p className={s.price} aria-live="polite">
                  {/* The new price rolls up as the old one leaves. */}
                  <span className={s.amount}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={price}
                        className={s.amountValue}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: dur.state, ease: ease.state }}
                      >
                        {rupees(price)}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className={s.per}>
                    {billing === "annual" ? "per year" : "per month"}
                  </span>
                </p>
                <p className={s.planNote}>
                  {billing === "annual"
                    ? `${rupees(price / 12)} a month, billed yearly`
                    : `or ${rupees(PLAN_PRICING[tier].annual)} billed yearly`}
                </p>
                {!user ? (
                  <Link
                    to="/login"
                    className={`${s.cta} ${s.planCta} ${s.ctaRoll}`}
                    onClick={() =>
                      trackEvent("sign_up_click", {
                        cta_id: "choose_plan",
                        cta_location: "pricing",
                        plan_tier: tier,
                        billing_period: billing,
                      })
                    }
                  >
                    <Roll>Choose {PLAN_TIER_LABELS[tier]}</Roll>
                    <span className={s.chip} aria-hidden="true">
                      <Arrow />
                    </span>
                  </Link>
                ) : manage ? (
                  <Link
                    to="/subscription"
                    className={`${s.cta} ${s.planCta}`}
                    aria-label={`Manage your plan (${PLAN_TIER_LABELS[tier]})`}
                  >
                    Manage Plan
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className={s.included}>
          <h3 className={s.h3}>Included in every plan</h3>
          <ul>
            {PLAN_FEATURES.map((f) => (
              <li key={f}>
                <Icon name="check" size={16} className={s.check} />
                {f}
              </li>
            ))}
          </ul>
          <p className={s.fine}>
            Prices in Indian rupees. Your plan follows the company size you
            choose during organisation setup, and payment is handled securely by{" "}
            <a href="https://razorpay.com/" rel="noopener">
              Razorpay
            </a>
            .
          </p>
          <div className={s.salesRow}>
            <p>
              Rolling out to a larger team, or need something specific to your
              organisation?
            </p>
            <div className={s.actions}>
              <Link
                to="/contact"
                className={`${s.cta} ${s.ctaGhost}`}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "contact_sales",
                    cta_location: "pricing",
                  })
                }
              >
                Contact Sales
              </Link>
              <Link
                to="/contact?topic=custom"
                className={s.textLink}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "custom_solution",
                    cta_location: "pricing",
                  })
                }
              >
                Get a Custom HRMS Solution
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
