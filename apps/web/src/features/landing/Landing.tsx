import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PLAN_PRICING,
  PLAN_TIER_LABELS,
  TIER_EMPLOYEE_LIMITS,
  type Billing,
  type PlanTier,
} from "@web/shared/constants/billing";
import { PLAN_FEATURES } from "@web/features/auth/org-setup/constants";
import { UserContext } from "@web/app/providers/UserContext";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import { Avatar, Icon, Menu, type IconName } from "@next/ui";
import { BrandLockup } from "../auth/BrandMark";
import { MacBookShowcase, type ShowcaseScene } from "./MacBookShowcase";
import { Abilities } from "./Abilities";
import s from "./landing.module.css";

/**
 * The public landing page at "/". Everything on it is static: the product
 * imagery is real Praesto screens captured from a development build with
 * fictional records (public/images/product-showcase), and pricing comes from
 * the same constants checkout uses. Nothing here calls the API. The one
 * exception to "real screens" is the abilities row (Abilities.tsx): face
 * punch-in, offline and the assistant are drawn, using the app's own words.
 *
 * Getting started is Praesto's real onboarding: sign in with Google, and an
 * account without an organisation is taken through organisation setup and
 * checkout. So "Get Started" and "Sign In" both lead to /login.
 */

const SHOT = "/images/product-showcase";

const SCENES: ShowcaseScene[] = [
  {
    id: "today",
    label: "Overview",
    title: "Your day, at a glance.",
    body: "Hours worked, the requests waiting on you and what’s coming up — on one screen.",
    src: `${SHOT}/today.png`,
    alt: "Praesto’s Today screen: hours worked so far, a month of attendance, four requests awaiting a decision and upcoming events.",
  },
  {
    id: "people",
    label: "People",
    title: "Everyone, in one directory.",
    body: "Every employee with their role, department, joining date and KYC status.",
    src: `${SHOT}/employees.png`,
    alt: "Praesto’s employee directory listing names, designations, departments, joining dates and KYC status.",
  },
  {
    id: "attendance",
    label: "Attendance",
    title: "Every workday, accounted for.",
    body: "Punches, hours and status for the month, with corrections tracked against your policy.",
    src: `${SHOT}/attendance.png`,
    alt: "Praesto’s attendance screen for October with present days, paid leave, corrections left and a day-by-day table.",
  },
  {
    id: "hiring",
    label: "Hiring",
    title: "Your hiring funnel, clearly.",
    body: "Applicants at every stage, by role and by hiring manager.",
    src: `${SHOT}/recruitment.png`,
    alt: "Praesto’s recruitment analytics: a hiring funnel from applied to hired, applications by role and openings by status.",
  },
  {
    id: "payroll",
    label: "Payroll",
    title: "Payroll, run by run.",
    body: "Take each month from draft to approved to disbursed, with gross and net totals.",
    src: `${SHOT}/payroll.png`,
    alt: "Praesto’s payroll runs: six months of runs with employee counts, gross and net totals and their status.",
  },
];

/** The rest of the workspace, for the second showcase. */
const MORE_SCENES: ShowcaseScene[] = [
  {
    id: "calendar",
    label: "Calendar",
    title: "One calendar for the whole company.",
    body: "Events and holidays across the month, with today’s schedule beside them.",
    src: `${SHOT}/calendar.png`,
    alt: "Praesto’s calendar for October with company events, a holiday and today’s schedule.",
  },
  {
    id: "reports",
    label: "Reports",
    title: "Build the report you need.",
    body: "Pick a data source and columns, add filters and sorting, then export to CSV or save it.",
    src: `${SHOT}/reports.png`,
    alt: "Praesto’s report builder with chosen columns on the left and eleven employee rows of results.",
  },
  {
    id: "roles",
    label: "Roles",
    title: "Roles that match how you work.",
    body: "Bundle permissions into roles, scoped to a person’s own records, their team or everyone.",
    src: `${SHOT}/permissions.png`,
    alt: "Praesto’s roles screen: the Team Lead role with its members and leave permissions scoped to the team.",
  },
  {
    id: "settings",
    label: "Settings",
    title: "Set up the way you hire.",
    body: "Define interview rounds, who owns each one and where background verification happens.",
    src: `${SHOT}/settings.png`,
    alt: "Praesto’s recruitment pipeline settings with a three-round default pipeline and an interns pipeline.",
  },
  {
    id: "audit",
    label: "Audit Log",
    title: "Every change, before and after.",
    body: "See who changed what, when and from where — field by field.",
    src: `${SHOT}/audit-log.png`,
    alt: "Praesto’s audit log with an attendance-settings change open, showing each field’s value before and after.",
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    title: "Requests with an owner and a deadline.",
    body: "Each ticket carries a priority, an SLA due date and a conversation, with internal notes for your team.",
    src: `${SHOT}/helpdesk.png`,
    alt: "A Praesto helpdesk ticket with its status, priority, SLA due date and a conversation including an internal note.",
  },
  {
    id: "policies",
    label: "Policies",
    title: "Policies people can find.",
    body: "Publish policies by category; everyone can read them and download a PDF.",
    src: `${SHOT}/policies.png`,
    alt: "Praesto’s policies screen showing the leave policy alongside the list of company policies.",
  },
  {
    id: "announcements",
    label: "Announcements",
    title: "News that reaches everyone.",
    body: "Post announcements to the whole organisation, and keep past ones on record.",
    src: `${SHOT}/announcements.png`,
    alt: "Praesto’s announcements screen listing three current company announcements.",
  },
  {
    id: "payslips",
    label: "Payslips",
    title: "Payslips without the email chain.",
    body: "People see their net pay, deductions and TDS, and download their own payslips.",
    src: `${SHOT}/payslips.png`,
    alt: "Praesto’s payslips screen with the latest net pay and four months of payslips to download.",
  },
  {
    id: "billing",
    label: "Billing",
    title: "Your plan, in plain sight.",
    body: "See your plan, renewal date and payment method, and change plans as you grow.",
    src: `${SHOT}/subscription.png`,
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
}[] = [
  {
    id: "approvals",
    label: "Approvals",
    title: "Every request. One inbox.",
    body: "Leave, work from home, salary advances and KYC reviews arrive in one place. Decide in a tap, and each request moves through the approval chain you set up.",
    src: `${SHOT}/today.png`,
    alt: "Praesto’s list of requests needing a decision: casual leave, work from home and a salary advance with Approve and Reject, and a KYC review.",
    crop: { x: 272, y: 524, w: 760, h: 336 },
  },
  {
    id: "organisation",
    label: "Organisation",
    title: "Your organisation, mapped.",
    body: "See who leads each team and who belongs where. Permissions follow the structure, scoped to a person’s own records, their team or everyone.",
    src: `${SHOT}/organisation.png`,
    alt: "Praesto’s organisation view: the founder, five teams with their leads, and headcount totals.",
    crop: { x: 268, y: 0, w: 900, h: 560 },
  },
  {
    id: "hiring",
    label: "Recruitment",
    title: "Hiring you can follow.",
    body: "Track every applicant from application to offer, with the funnel, roles and hiring managers at a glance.",
    src: `${SHOT}/recruitment.png`,
    alt: "Praesto’s recruitment analytics: a hiring funnel from applied to hired, applications by role and openings by status.",
    crop: { x: 268, y: 0, w: 1100, h: 640 },
  },
  {
    id: "insight",
    label: "Analytics",
    title: "Answers, not spreadsheets.",
    body: "Workforce, attendance, recruitment and salary analytics are built in. When you need something specific, the report builder exports to CSV.",
    src: `${SHOT}/analytics.png`,
    alt: "Praesto’s workforce analytics: headcount growth by month, new joiners, employment status and department breakdown.",
    crop: { x: 268, y: 0, w: 1100, h: 640 },
  },
  {
    id: "chat",
    label: "Chat",
    title: "Conversations where the work is.",
    body: "One-to-one chat with replies, pinned messages, files and read receipts, right next to the rest of your HR.",
    src: `${SHOT}/chat.png`,
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
    icon: "alert",
    title: "Unusual sign-ins flagged",
    body: "Sign-ins from a new device, country or hour are scored for risk, and risky ones are emailed to the account owner.",
  },
];

const TIERS: PlanTier[] = ["starter", "growth", "enterprise"];

/** A signed-in person's display name. */
function nameOf(user: any): string {
  return (
    user?.fullName ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "Your account"
  );
}

export default function Landing() {
  const { user } = useContext(UserContext);
  const signedIn = Boolean(user);
  const [overDark, setOverDark] = useState(true);

  useEffect(() => {
    document.title = "Praesto · People operations, beautifully connected";
  }, []);

  // The bar takes the tone of whatever section is under it: dark over the
  // hero, security and closing sections, light everywhere else.
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
  }, []);

  return (
    <div className={s.page}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <NavBar tone={overDark ? "dark" : "light"} user={user} />

      <main id="main">
        <section className={s.hero} data-nav-dark aria-labelledby="hero-title">
          <div className={s.heroCopy}>
            <motion.h1
              id="hero-title"
              className={s.heroTitle}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
            >
              People operations,
              <br /> beautifully connected.
            </motion.h1>
            <motion.p
              className={s.heroLead}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0, 0, 1] }}
            >
              Attendance, leave, hiring, payroll and approvals for your whole
              organisation — together in one workspace.
            </motion.p>
            <motion.div
              className={s.actions}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18, ease: [0.2, 0, 0, 1] }}
            >
              <Link
                to={signedIn ? "/dashboard" : "/login"}
                className={`${s.cta} ${s.ctaPrimary}`}
              >
                {signedIn ? "Open Dashboard" : "Get Started"}
              </Link>
              <a href="#features" className={`${s.cta} ${s.ctaGhost}`}>
                Explore the Platform
                <Icon name="chevronDown" size={14} />
              </a>
            </motion.div>
          </div>

          <motion.div
            className={s.heroDevice}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.2, 0, 0, 1] }}
          >
            <MacBookShowcase
              scenes={SCENES}
              label="Praesto product tour"
              priority
            />
          </motion.div>
        </section>

        <div id="features" className={s.anchor} />

        <section className={s.stackSection} aria-labelledby="features-title">
          <Reveal className={s.galleryHead}>
            <h2 id="features-title" className={s.h2}>
              Built for the way people work.
            </h2>
            <p className={s.lead}>
              The everyday work of HR, from the first request of the morning to
              the last payroll run of the month.
            </p>
          </Reveal>
          <ol className={s.stack}>
            {STACK.map((c, i) => (
              <li
                key={c.id}
                className={s.stackCard}
                style={{ ["--i" as string]: i }}
                aria-labelledby={`${c.id}-title`}
              >
                <div className={s.stackCopy}>
                  <span className={s.stackLabel}>{c.label}</span>
                  <h3 id={`${c.id}-title`} className={s.stackTitle}>
                    {c.title}
                  </h3>
                  <p className={s.stackBody}>{c.body}</p>
                </div>
                <div className={s.stackShot}>
                  <Shot src={c.src} alt={c.alt} crop={c.crop} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.anywhere} aria-labelledby="anywhere-title">
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
          <Reveal className={s.phones} delay={0.06}>
            <Phone
              src={`${SHOT}/mobile-approvals.png`}
              alt="Praesto on a phone: the Approvals inbox with leave, work-from-home, salary advance and KYC requests."
            />
            <Phone
              src={`${SHOT}/mobile-today.png`}
              alt="Praesto on a phone: the Today screen with hours worked, a month of attendance and requests to decide."
              front
            />
            <Phone
              src={`${SHOT}/mobile-chat.png`}
              alt="Praesto on a phone: a chat conversation with a pinned message and a reply."
            />
          </Reveal>
        </section>

        <section
          id="abilities"
          className={`${s.section} ${s.abilities}`}
          aria-labelledby="abilities-title"
        >
          <Reveal className={s.galleryHead}>
            <h2 id="abilities-title" className={s.h2}>
              Ready for the real workday.
            </h2>
            <p className={s.lead}>
              Punch in with your face, keep working when the signal drops, and
              get answers without digging through menus.
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
          <Reveal delay={0.06}>
            <MacBookShowcase
              scenes={MORE_SCENES}
              label="More of Praesto"
              interval={6000}
            />
          </Reveal>
        </section>

        <section
          id="modules"
          className={`${s.section} ${s.tintSection}`}
          aria-labelledby="modules-title"
        >
          <Reveal className={s.sectionHead}>
            <h2 id="modules-title" className={s.h2}>
              Twenty-five modules. One workspace.
            </h2>
            <p className={s.lead}>
              From someone’s first application to their last working day, every
              part of the employee lifecycle shares the same people, the same
              permissions and the same approvals.
            </p>
          </Reveal>
          <Reveal className={s.modules} delay={0.06}>
            {MODULES.map((g) => (
              <div key={g.group} className={s.moduleGroup}>
                <h3 className={s.moduleHead}>{g.group}</h3>
                <ul className={s.moduleList}>
                  {g.items.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
        </section>

        <section
          id="security"
          className={`${s.section} ${s.dark}`}
          data-nav-dark
          aria-labelledby="security-title"
        >
          <Reveal className={s.sectionHead}>
            <h2 id="security-title" className={s.h2}>
              Private by design.
            </h2>
            <p className={s.lead}>
              HR data is the most personal data a company holds. Praesto is
              built so it stays with the people who should see it.
            </p>
          </Reveal>
          <Reveal className={s.securityShot} delay={0.04}>
            <Shot
              src={`${SHOT}/audit-log.png`}
              alt="Praesto’s audit log with a settings change open, listing each field’s value before and after."
              crop={{ x: 268, y: 0, w: 1172, h: 700 }}
            />
          </Reveal>
          <Reveal className={s.security} delay={0.06}>
            {SECURITY.map((f) => (
              <div key={f.title} className={s.securityItem}>
                <Icon name={f.icon} size={20} className={s.securityIcon} />
                <h3 className={s.h3}>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </Reveal>
        </section>

        <Pricing user={user} />

        <section
          className={s.closing}
          data-nav-dark
          aria-labelledby="closing-title"
        >
          <Reveal className={s.closingInner}>
            <h2 id="closing-title" className={s.closingTitle}>
              Bring your people operations together.
            </h2>
            <p className={s.lead}>
              {signedIn
                ? "Your workspace is ready when you are."
                : "Sign in with Google and set up your organisation in three short steps."}
            </p>
            <div className={s.actions}>
              {signedIn ? (
                <Link to="/dashboard" className={`${s.cta} ${s.ctaPrimary}`}>
                  Open Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className={`${s.cta} ${s.ctaPrimary}`}>
                    Get Started
                  </Link>
                  <Link to="/login" className={`${s.cta} ${s.ctaGhost}`}>
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <Footer signedIn={signedIn} />
    </div>
  );
}

// ── Navigation ─────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#modules", label: "Modules" },
  { href: "#pricing", label: "Pricing" },
];

function NavBar({ tone, user }: { tone: "dark" | "light"; user: any }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) =>
      e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  return (
    <header className={s.nav} data-tone={tone}>
      <div className={s.navInner} ref={menuRef}>
        <Link to="/" className={s.brand} aria-label="Praesto home">
          <BrandLockup size={24} inverse={tone === "dark"} />
        </Link>
        <nav aria-label="Primary" className={s.navLinks}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={s.navActions}>
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Link to="/login" className={s.signIn}>
                Sign In
              </Link>
              <Link
                to="/login"
                className={`${s.cta} ${s.ctaPrimary} ${s.ctaSm}`}
              >
                Get Started
              </Link>
            </>
          )}
          <button
            type="button"
            className={s.menuButton}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "x" : "more"} size={18} />
          </button>
        </div>
        {open && (
          <nav id="landing-menu" aria-label="Sections" className={s.menu}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            {user ? (
              <Link to="/dashboard">Open Dashboard</Link>
            ) : (
              <Link to="/login">Sign In</Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

/** The signed-in person, in place of Sign In: their name and a short menu. */
function AccountMenu({ user }: { user: any }) {
  const { handleLogout } = useContext(UserContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const name = nameOf(user);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={s.account}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={name} src={user?.imageURL} size={28} />
        <span className={s.accountName}>{name}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        label="Account"
        items={[
          ...(user?.tenantName ? [{ heading: user.tenantName }] : []),
          {
            label: "Open Dashboard",
            icon: "today",
            onSelect: () => navigate("/dashboard"),
          },
          {
            label: "Profile",
            icon: "person",
            onSelect: () => navigate("/profile"),
          },
          { separator: true },
          { label: "Log Out…", icon: "logout", onSelect: handleLogout },
        ]}
      />
    </>
  );
}

// ── Building blocks ────────────────────────────────────────────────────────

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A real screen, cropped to the part worth showing — never stretched.
 * `crop` is a region of the 1440 × 900 capture (CSS pixels); the frame takes
 * that region's ratio and the image is scaled uniformly to fill it.
 */
function Shot({
  src,
  alt,
  crop = { x: 0, y: 0, w: 1440, h: 900 },
}: {
  src: string;
  alt: string;
  crop?: { x: number; y: number; w: number; h: number };
}) {
  return (
    <figure className={s.shot} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1440}
        height={900}
        style={{
          width: `${(1440 / crop.w) * 100}%`,
          transform: `translate(${(-crop.x / 1440) * 100}%, ${(-crop.y / 900) * 100}%)`,
        }}
      />
    </figure>
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

function Pricing({ user }: { user: any }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  // Signed in: plans are managed on the Subscription page, by those allowed.
  const manage = user ? hasSubscriptionAccess(user) : false;
  const options: { value: Billing; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "annual", label: "Annual" },
  ];

  return (
    <section id="pricing" className={s.section} aria-labelledby="pricing-title">
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
                  <span className={s.amount}>{rupees(price)}</span>
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
                    className={`${s.cta} ${s.planCta}`}
                    aria-label={`Get started with ${PLAN_TIER_LABELS[tier]}`}
                  >
                    Get Started
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
            choose during organisation setup, and payment is handled securely by
            Razorpay.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────

function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <div className={s.footerBrand}>
          <Link to="/" aria-label="Praesto home">
            <BrandLockup size={22} />
          </Link>
          <p>People operations, beautifully connected.</p>
        </div>
        <nav aria-label="Product" className={s.footerCol}>
          <h2>Product</h2>
          <a href="#features">Features</a>
          <a href="#modules">Modules</a>
          <a href="#security">Security</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <nav aria-label="Account" className={s.footerCol}>
          <h2>Account</h2>
          {signedIn ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/profile">Profile</Link>
            </>
          ) : (
            <>
              <Link to="/login">Sign In</Link>
              <Link to="/login">Get Started</Link>
            </>
          )}
        </nav>
        <nav aria-label="Legal" className={s.footerCol}>
          <h2>Legal</h2>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-use">Terms of Use</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </nav>
        <div className={s.footerCol}>
          <h2>Contact</h2>
          <a href="mailto:support@praesto.in">support@praesto.in</a>
          <a href="mailto:hello@praesto.in">hello@praesto.in</a>
        </div>
      </div>
      <p className={s.copyright}>
        © {new Date().getFullYear()} Praesto. Product screens show a fictional
        organisation.
      </p>
    </footer>
  );
}
