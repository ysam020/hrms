import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import s from "./public.module.css";

/**
 * Stands in for Classic's pages/legal/LegalPageLayout, so the policy prose
 * stays in one place and renders in this app's reading layout. Titles and
 * descriptions for search live in src/app/seo.ts.
 */
export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className={s.publicPage}>
      <header className={s.publicBar}>
        <Link to="/" className={s.brand}>
          <span className={s.glyph}>P</span> Praesto
        </Link>
        <nav className={s.legalNav} aria-label="Policies">
          <Link to="/privacy-policy">Privacy</Link>
          <Link to="/terms-of-use">Terms</Link>
          <Link to="/refund-policy">Refunds</Link>
        </nav>
      </header>
      <main>
        <article className={s.legal}>
          <h1 className="px-display">{title}</h1>
          <p className="px-meta">Last updated {lastUpdated}</p>
          <div className={s.prose}>{children}</div>
        </article>
      </main>
      <footer className={s.legalFooter}>
        <nav aria-label="Site">
          <Link to="/">Praesto home</Link>
          <a href="/#pricing">Pricing</a>
          <a href="mailto:support@praesto.in">support@praesto.in</a>
        </nav>
      </footer>
    </div>
  );
}
