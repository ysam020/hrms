import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { UserContext } from "@web/app/providers/UserContext";
import { Avatar, Icon, Menu } from "@next/ui";
import { trackEvent } from "@next/app/analytics";
import { BrandLockup } from "../auth/BrandMark";
import { dur, ease } from "./motion";
import s from "./landing.module.css";

// The public site's shared chrome: the navigation bar, the footer and the
// rolling call-to-action label. The landing page uses them as they are;
// other public pages (/product-demo) pass home={false}, so the section links
// lead back to the landing page's sections.

/** A signed-in person's display name. */
function nameOf(user: any): string {
  return (
    user?.fullName ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "Your account"
  );
}

/**
 * A label that rolls: hovering slides a second copy up from below (the copy
 * is aria-hidden, so it's read once).
 */
export function Roll({ children }: { children: ReactNode }) {
  return (
    <span className={s.roll}>
      <span className={s.rollInner}>
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
    </span>
  );
}

export function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// ── Navigation ─────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "#features", label: "Features", key: "features" },
  { href: "#platform", label: "Platform", key: "platform" },
  { href: "#modules", label: "Modules", key: "modules" },
  { href: "#demos", label: "Demos", key: "demos" },
  { href: "#pricing", label: "Pricing", key: "pricing" },
];

/** A nav link's target: the section here, or the right page elsewhere. */
function linkFor(hash: string, home: boolean) {
  if (home) return hash;
  return hash === "#demos" ? "/product-demo" : `/${hash}`;
}

export function NavBar({
  tone,
  user,
  current,
  home = true,
}: {
  tone: "dark" | "light";
  user: any;
  /** On the landing page itself; elsewhere section links go to "/#…". */
  home?: boolean;
  /** The section under the bar, if it has a link. */
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Past the first few pixels the bar tightens and lifts. An attribute, not
  // state, so scrolling never re-renders the nav.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      el.toggleAttribute("data-scrolled", window.scrollY > 24);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

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
    <header ref={headerRef} className={s.nav} data-tone={tone}>
      <div className={s.navInner} ref={menuRef}>
        <Link to="/" className={s.brand} aria-label="Praesto home">
          <BrandLockup size={24} inverse={tone === "dark"} />
        </Link>
        <nav aria-label="Primary" className={s.navLinks}>
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={linkFor(l.href, home)}
              aria-current={current === l.key ? "location" : undefined}
            >
              {l.label}
              {/* One mark that slides between links as the page scrolls. */}
              {current === l.key && (
                <motion.span
                  layoutId="landing-nav-current"
                  className={s.navMark}
                  transition={{ duration: dur.state, ease: ease.state }}
                />
              )}
            </a>
          ))}
        </nav>
        <div className={s.navActions}>
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <>
              <Link
                to="/login"
                className={s.signIn}
                onClick={() =>
                  trackEvent("cta_click", {
                    cta_id: "sign_in",
                    cta_location: "nav",
                  })
                }
              >
                Sign In
              </Link>
              <Link
                to="/login"
                className={`${s.cta} ${s.ctaPrimary} ${s.ctaSm}`}
                onClick={() =>
                  trackEvent("sign_up_click", {
                    cta_id: "start_trial",
                    cta_location: "nav",
                  })
                }
              >
                Start Free Trial
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
        <AnimatePresence>
          {open && (
            <motion.nav
              id="landing-menu"
              aria-label="Sections"
              className={s.menu}
              initial="closed"
              animate="open"
              exit="closed"
              variants={menuVariants}
            >
              {NAV_LINKS.map((l) => (
                <motion.a
                  key={l.href}
                  href={linkFor(l.href, home)}
                  variants={menuItem}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </motion.a>
              ))}
              <motion.span variants={menuItem} className={s.menuLast}>
                {user ? (
                  <Link to="/dashboard">Open Dashboard</Link>
                ) : (
                  <>
                    <Link
                      to="/book-demo"
                      onClick={() =>
                        trackEvent("cta_click", {
                          cta_id: "book_demo",
                          cta_location: "mobile_menu",
                        })
                      }
                    >
                      Book a Demo
                    </Link>
                    <Link
                      to="/login"
                      onClick={() =>
                        trackEvent("cta_click", {
                          cta_id: "sign_in",
                          cta_location: "mobile_menu",
                        })
                      }
                    >
                      Sign In
                    </Link>
                  </>
                )}
              </motion.span>
            </motion.nav>
          )}
        </AnimatePresence>
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

const menuVariants: Variants = {
  closed: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: 0.15, ease: ease.state },
  },
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: dur.state,
      ease: ease.out,
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};
const menuItem: Variants = {
  closed: { opacity: 0, x: -8 },
  open: { opacity: 1, x: 0, transition: { duration: 0.3, ease: ease.out } },
};

// ── Footer ─────────────────────────────────────────────────────────────────

export function Footer({
  signedIn,
  home = true,
}: {
  signedIn: boolean;
  home?: boolean;
}) {
  const at = (hash: string) => (home ? hash : `/${hash}`);
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
          <p className={s.footerHead}>Product</p>
          <a href={at("#features")}>Features</a>
          <a href={at("#how-it-works")}>How It Works</a>
          <a href={at("#attendance-rules")}>Attendance</a>
          <a href={at("#permissions")}>Permissions</a>
          <a href={at("#reports")}>Reports</a>
          <a href={at("#modules")}>Modules</a>
          <a href={at("#security")}>Security</a>
          <a href={at("#pricing")}>Pricing</a>
          <Link to="/product-demo">Product Demo</Link>
        </nav>
        <nav aria-label="Account" className={s.footerCol}>
          <p className={s.footerHead}>Account</p>
          {signedIn ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/profile">Profile</Link>
            </>
          ) : (
            <Link
              to="/login"
              onClick={() =>
                trackEvent("cta_click", {
                  cta_id: "sign_in",
                  cta_location: "footer",
                })
              }
            >
              Sign In
            </Link>
          )}
        </nav>
        <nav aria-label="Legal" className={s.footerCol}>
          <p className={s.footerHead}>Legal</p>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-use">Terms of Use</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </nav>
        <nav aria-label="Sales" className={s.footerCol}>
          <p className={s.footerHead}>Sales</p>
          <Link
            to="/book-demo"
            onClick={() =>
              trackEvent("cta_click", {
                cta_id: "book_demo",
                cta_location: "footer",
              })
            }
          >
            Book a Demo
          </Link>
          <Link
            to="/contact"
            onClick={() =>
              trackEvent("cta_click", {
                cta_id: "contact_sales",
                cta_location: "footer",
              })
            }
          >
            Contact Sales
          </Link>
        </nav>
        <div className={s.footerCol}>
          <p className={s.footerHead}>Contact</p>
          <a href="mailto:support@praesto.in">support@praesto.in</a>
          <a href="mailto:hello@praesto.in">hello@praesto.in</a>
        </div>
      </div>
      <p className={s.copyright}>
        © {new Date().getFullYear()} 2026 Praesto. All rights reserved.
      </p>
    </footer>
  );
}
